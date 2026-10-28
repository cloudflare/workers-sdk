import { setTimeout as sleep } from "node:timers/promises";
import type { Response } from "../../../http";
import type { Log } from "../../../shared";
import type { CommonOptions } from "./schemas";
import type { BrowserContext, HTTPResponse, Page } from "@cloudflare/puppeteer";
import type { z } from "zod";

export interface QuickActionContext<Schema extends z.ZodType> {
	context: BrowserContext;
	options: z.output<Schema>;
	log: Log;
}

export interface QuickActionDefinition {
	schema: z.ZodType;
	// A method, so each action's `run` can take its own schema's options
	run(ctx: QuickActionContext<z.ZodType>): Promise<Response>;
}

export async function withTimeout<T>(
	promise: Promise<T>,
	ms: number | undefined,
	error: Error
): Promise<T> {
	if (!ms) {
		return promise;
	}
	let timer: NodeJS.Timeout | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(error), ms);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

export function withStepTimeout<T>(
	options: CommonOptions,
	promise: Promise<T>,
	step: string
): Promise<T> {
	return withTimeout(
		promise,
		options.actionTimeout,
		new Error(`${step} timed out`)
	);
}

const swallowIf =
	(bestAttempt: boolean | undefined) =>
	(error: unknown): null => {
		if (bestAttempt) {
			return null;
		}
		throw error;
	};

export async function openPage(
	context: BrowserContext,
	options: CommonOptions
): Promise<{ page: Page; response: HTTPResponse | null }> {
	const page = await context.newPage();
	page.on("dialog", (dialog) => void dialog.dismiss().catch(() => {}));
	if (options.emulateMediaType) {
		await page.emulateMediaType(options.emulateMediaType);
	}
	if (options.cookies?.length) {
		await page.setCookie(...options.cookies);
	}
	await page.setViewport(options.viewport);
	await page.setUserAgent(options.userAgent);
	if (options.authenticate) {
		await page.authenticate(options.authenticate);
	}
	if (options.setExtraHTTPHeaders) {
		await page.setExtraHTTPHeaders(options.setExtraHTTPHeaders);
	}
	if (options.setJavaScriptEnabled !== undefined) {
		await page.setJavaScriptEnabled(options.setJavaScriptEnabled);
	}
	const rejectPatterns = (options.rejectRequestPattern ?? []).map(
		(pattern) => new RegExp(pattern)
	);
	const allowPatterns = (options.allowRequestPattern ?? []).map(
		(pattern) => new RegExp(pattern)
	);
	const rejectTypes: string[] = options.rejectResourceTypes ?? [];
	const allowTypes: string[] = options.allowResourceTypes ?? [];
	const allowAll = allowPatterns.length === 0 && allowTypes.length === 0;
	if (rejectPatterns.length > 0 || rejectTypes.length > 0 || !allowAll) {
		await page.setRequestInterception(true);
		page.on("request", (request) => {
			const url = request.url();
			const type = request.resourceType();
			const allowed =
				!rejectPatterns.some((p) => p.test(url)) &&
				!rejectTypes.includes(type) &&
				(allowAll ||
					allowPatterns.some((p) => p.test(url)) ||
					allowTypes.includes(type));
			void (allowed ? request.continue() : request.abort()).catch(() => {});
		});
	}

	let response: HTTPResponse | null = null;
	if (options.url) {
		response = await page
			.goto(options.url, options.gotoOptions)
			.catch(swallowIf(options.bestAttempt));
	} else if (options.html) {
		await page.setContent(options.html).catch(swallowIf(options.bestAttempt));
	}
	return { page, response };
}

export async function afterNavigation(page: Page, options: CommonOptions) {
	for (const tag of options.addStyleTag ?? []) {
		await page.addStyleTag(tag).catch(() => {});
	}
	for (const tag of options.addScriptTag ?? []) {
		await page.addScriptTag(tag);
	}
	if (options.waitForSelector) {
		const { selector, hidden, visible, timeout } = options.waitForSelector;
		await page
			.waitForSelector(selector, { hidden, visible, timeout })
			.catch(swallowIf(options.bestAttempt));
	}
	if (options.waitForTimeout) {
		// Don't keep Node running if the request times out first
		await sleep(options.waitForTimeout, undefined, { ref: false });
	}
}

export type PageMeta = ReturnType<typeof pageMeta>;

export function pageMeta(response: HTTPResponse | null, title = "") {
	const hops = response?.request().redirectChain() ?? [];
	const redirectChain = hops.flatMap((hop) => {
		const hopResponse = hop.response();
		if (hopResponse === null) {
			return [];
		}
		return [
			{
				url: hop.url(),
				status: hopResponse.status(),
				headers: hopResponse.headers(),
			},
		];
	});
	return {
		// `html` input has no navigation response, but still reports 200
		status: response?.status() ?? 200,
		title,
		headers: response?.headers(),
		finalUrl: response?.url(),
		redirectChain: hops.length > 0 ? redirectChain : undefined,
	};
}
