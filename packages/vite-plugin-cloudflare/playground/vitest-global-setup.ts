import { chromium } from "playwright-chromium";
import type { BrowserServer } from "playwright-chromium";
import type { GlobalSetupContext } from "vitest/node";

let browserServer: BrowserServer | undefined;

export async function setup({ provide }: GlobalSetupContext): Promise<void> {
	process.env.NODE_ENV = process.env.VITE_TEST_BUILD
		? "production"
		: "development";

	browserServer = await chromium.launchServer({
		headless: !process.env.VITE_DEBUG_SERVE,
		args: process.env.CI
			? ["--no-sandbox", "--disable-setuid-sandbox"]
			: undefined,
	});

	provide("wsEndpoint", browserServer.wsEndpoint());
}

export async function teardown(): Promise<void> {
	await browserServer?.close();
}
