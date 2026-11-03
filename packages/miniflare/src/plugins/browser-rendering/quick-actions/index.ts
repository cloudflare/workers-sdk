import { connect } from "@cloudflare/puppeteer";
import { Response } from "../../../http";
import { launchBrowser } from "../index";
import { closeBrowserProcess } from "../process";
import {
	accessibilityTree,
	accessibilityTreeSchema,
} from "./accessibility-tree";
import { content } from "./content";
import { HtmlToMarkdownError, quickActionErrorResponse } from "./errors";
import { json, jsonSchema } from "./json";
import { links, linksSchema } from "./links";
import { markdown } from "./markdown";
import { withTimeout } from "./page";
import { pdf, pdfSchema } from "./pdf";
import { browserSchema, cacheTTLSchema, commonOptionsSchema } from "./schemas";
import { scrape, scrapeSchema } from "./scrape";
import { screenshot, screenshotSchema } from "./screenshot";
import { snapshot, snapshotSchema } from "./snapshot";
import type { Log } from "../../../shared";
import type { QuickActionName } from "../../../workers/browser-rendering/quick-action-names";
import type { QuickActionContext, QuickActionDefinition } from "./page";
import type { CommonOptions } from "./schemas";
import type { Browser, BrowserContext } from "@cloudflare/puppeteer";
import type { z } from "zod";

function defineQuickAction<Schema extends z.ZodType>(
	schema: Schema,
	run: (ctx: QuickActionContext<Schema>) => Promise<Response>
): QuickActionDefinition {
	return { schema, run };
}

const QUICK_ACTIONS: Record<QuickActionName, QuickActionDefinition> = {
	screenshot: defineQuickAction(screenshotSchema, screenshot),
	content: defineQuickAction(commonOptionsSchema, content),
	pdf: defineQuickAction(pdfSchema, pdf),
	scrape: defineQuickAction(scrapeSchema, scrape),
	links: defineQuickAction(linksSchema, links),
	snapshot: defineQuickAction(snapshotSchema, snapshot),
	accessibilityTree: defineQuickAction(
		accessibilityTreeSchema,
		accessibilityTree
	),
	json: defineQuickAction(jsonSchema, json),
	markdown: defineQuickAction(commonOptionsSchema, markdown),
};

export interface QuickActionBrowser {
	browser: Browser;
	close(): Promise<void>;
}

export async function startQuickActionBrowser(
	options: Omit<Parameters<typeof launchBrowser>[0], "headful">
): Promise<QuickActionBrowser> {
	const { browserProcess, wsEndpoint } = await launchBrowser(options);
	const closeProcess = () => closeBrowserProcess(browserProcess, wsEndpoint);
	try {
		const browser = await connect({
			browserWSEndpoint: wsEndpoint,
			// Every action sets its own viewport
			defaultViewport: null,
		});
		// Chrome is unreachable once its connection drops, so close it then
		const closed = new Promise<void>((resolve) => {
			browser.once("disconnected", () => {
				resolve(closeProcess().catch(() => {}));
			});
		});
		return {
			browser,
			async close() {
				await browser.disconnect().catch(() => {});
				await closed;
			},
		};
	} catch (error) {
		await closeProcess();
		throw error;
	}
}

function withBrowserMs(response: Response, ms: number): Response {
	if (response.status < 500) {
		response.headers.set("X-Browser-Ms-Used", String(ms));
	}
	return response;
}

export async function runQuickAction({
	action,
	options,
	getBrowser,
	log,
}: {
	action: QuickActionName;
	options: Record<string, unknown>;
	getBrowser: () => Promise<Browser>;
	log: Log;
}): Promise<Response> {
	const { schema, run } = QUICK_ACTIONS[action];
	const { browser, cacheTTL, ...pageOptions } = options;
	const parsed = schema.safeParse(pageOptions);
	const parsedCacheTTL = cacheTTLSchema.safeParse(cacheTTL);
	const parsedBrowser = browserSchema.safeParse(browser);
	if (!parsed.success || !parsedCacheTTL.success || !parsedBrowser.success) {
		// In the order the service reports them
		const errors = [
			...(parsed.error?.issues ?? []),
			...(parsedCacheTTL.error?.issues ?? []),
			...(parsedBrowser.error?.issues ?? []),
		];
		return withBrowserMs(
			Response.json({ success: false, errors }, { status: 400 }),
			0
		);
	}

	const validated = parsed.data as CommonOptions;
	let context: BrowserContext;
	try {
		context = await (await getBrowser()).createBrowserContext();
	} catch (error) {
		return withBrowserMs(quickActionErrorResponse(error), 0);
	}
	const start = performance.now();
	try {
		const response = await withTimeout(
			run({ context, options: validated, log }),
			// The service gives each attempt 60 seconds unless actionTimeout is set
			validated.actionTimeout ? validated.actionTimeout + 500 : 60_000,
			new Error("Request timed out")
		);
		return withBrowserMs(response, Math.round(performance.now() - start));
	} catch (error) {
		// Only a failed Markdown conversion follows a completed browser session
		const ms =
			error instanceof HtmlToMarkdownError
				? Math.round(performance.now() - start)
				: 0;
		return withBrowserMs(quickActionErrorResponse(error), ms);
	} finally {
		await context.close().catch(() => {});
	}
}
