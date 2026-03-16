import { chromium } from "playwright-chromium";
import { beforeAll, inject } from "vitest";
import type { Browser, ConsoleMessage, Page } from "playwright-chromium";

export let browser: Browser;
export let page: Page;
export let viteUrl: string;
export let workerUrl: string;

const browserLogs = new Array<string>();
const browserErrors = new Array<Error>();

declare module "vitest" {
	export interface ProvidedContext {
		viteUrl: string;
		workerUrl: string;
		wsEndpoint: string;
	}
}

beforeAll(async () => {
	viteUrl = inject("viteUrl");
	workerUrl = inject("workerUrl");

	const wsEndpoint = inject("wsEndpoint");
	if (!wsEndpoint) {
		throw new Error("`wsEndpoint` not provided by global setup");
	}

	browser = await chromium.connect(wsEndpoint);
	page = await browser.newPage();

	// Collect browser console logs
	page.on("console", (msg: ConsoleMessage) => {
		browserLogs.push(`[${msg.type()}] ${msg.text()}`);
	});
	page.on("pageerror", (error: Error) => {
		browserErrors.push(error);
	});

	await page.goto(viteUrl);

	return async () => {
		await page?.close();
		await browser?.close();
		browserLogs.length = 0;
		browserErrors.length = 0;
	};
}, 30_000);
