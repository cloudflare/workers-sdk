import { chromium } from "playwright-chromium";
import { beforeAll, inject } from "vitest";
import type { Browser, ConsoleMessage, Page } from "playwright-chromium";

export let browser: Browser;
export let page: Page;
export let viteUrl: string;
export let workerUrl: string;

export const browserLogs = new Array<string>();
export const browserErrors = new Array<Error>();

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

/**
 * Navigate to a specific path in the app.
 */
export async function navigateTo(path: string): Promise<void> {
	const url = new URL(path, viteUrl);
	await page.goto(url.toString());
}

/**
 * Wait for the page to finish loading (no pending network requests).
 */
export async function waitForPageLoad(): Promise<void> {
	await page.waitForLoadState("networkidle");
}

/**
 * Get the current URL path.
 */
export function getCurrentPath(): string {
	const url = new URL(page.url());
	return url.pathname + url.search;
}

/**
 * Seed the KV namespace with test data.
 */
export async function seedKV(): Promise<void> {
	await fetch(`${workerUrl}/kv/seed`);
}

/**
 * Seed the D1 database with test data.
 */
export async function seedD1(): Promise<void> {
	await fetch(`${workerUrl}/d1`);
}

/**
 * Seed a Durable Object with test data.
 */
export async function seedDO(objectId: string = "test-object"): Promise<void> {
	await fetch(`${workerUrl}/do?id=${objectId}`);
}
