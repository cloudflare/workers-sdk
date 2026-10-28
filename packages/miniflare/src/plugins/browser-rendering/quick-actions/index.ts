import { connect } from "@cloudflare/puppeteer";
import { Response } from "../../../http";
import { launchBrowser } from "../index";
import { closeBrowserProcess } from "../process";
import { quickActionErrorResponse } from "./errors";
import { withTimeout } from "./page";
import { browserSchema } from "./schemas";
import type { Log } from "../../../shared";
import type { QuickActionName } from "../../../workers/browser-rendering/quick-action-names";
import type { QuickActionDefinition } from "./page";
import type { CommonOptions } from "./schemas";
import type { Browser, BrowserContext } from "@cloudflare/puppeteer";

const QUICK_ACTIONS: Record<QuickActionName, QuickActionDefinition> = {};

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
	const { schema, run }: QuickActionDefinition = QUICK_ACTIONS[action];
	const { browser, ...pageOptions } = options;
	const parsed = schema.safeParse(pageOptions);
	const parsedBrowser = browserSchema.safeParse(browser);
	if (!parsed.success || !parsedBrowser.success) {
		const errors = [
			...(parsed.error?.issues ?? []),
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
			validated.actionTimeout && validated.actionTimeout + 500,
			new Error("Request timed out")
		);
		return withBrowserMs(response, Math.round(performance.now() - start));
	} catch (error) {
		return withBrowserMs(quickActionErrorResponse(error), 0);
	} finally {
		await context.close().catch(() => {});
	}
}
