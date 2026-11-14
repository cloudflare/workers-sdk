import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-chromium";
import { createServer } from "vite";
import { afterAll, beforeAll, describe, test } from "vitest";
import {
	LOCAL_EXPLORER_API_PATH,
	LOCAL_EXPLORER_BASE_PATH,
} from "../../constants";
import type { Browser, Page } from "playwright-chromium";
import type { ViteDevServer } from "vite";

const PACKAGE_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../.."
);

// A single local worker with two KV namespaces, so the sidebar lists two
// items to navigate between.
const WORKERS_RESPONSE = {
	errors: [],
	messages: [],
	result: [
		{
			bindings: {
				kv: [
					{ bindingName: "KV_A", id: "kv-a" },
					{ bindingName: "KV_B", id: "kv-b" },
				],
			},
			isSelf: true,
			name: "my-worker",
		},
	],
	success: true,
};

const EMPTY_RESPONSE = {
	errors: [],
	messages: [],
	result: [],
	result_info: { count: 0, cursor: "" },
	success: true,
};

let browser: Browser;
let page: Page;
let viteServer: ViteDevServer;
let viteUrl: string;

beforeAll(async () => {
	viteServer = await createServer({
		logLevel: "silent",
		root: PACKAGE_DIR,
		server: { port: 0 },
	});
	await viteServer.listen();
	const address = viteServer.httpServer?.address();
	if (address === null || typeof address !== "object") {
		throw new Error("Vite dev server has no address");
	}
	viteUrl = `http://localhost:${address.port}`;

	browser = await chromium.launch({
		args: process.env.CI
			? ["--no-sandbox", "--disable-setuid-sandbox"]
			: undefined,
		headless: true,
	});
	page = await browser.newPage();

	// Stand in for the Miniflare local explorer API.
	await page.route(`**${LOCAL_EXPLORER_API_PATH}/**`, async (route) => {
		const { pathname } = new URL(route.request().url());
		const body =
			pathname === `${LOCAL_EXPLORER_API_PATH}/local/workers`
				? WORKERS_RESPONSE
				: EMPTY_RESPONSE;
		await route.fulfill({ json: body });
	});
}, 120_000);

afterAll(async () => {
	await page?.close();
	await browser?.close();
	await viteServer?.close();
});

describe("AppSidebar navigation", () => {
	test("navigating with an expanded sidebar item stays within the app, without reloading the page", async ({
		expect,
	}) => {
		await page.goto(`${viteUrl}${LOCAL_EXPLORER_BASE_PATH}/kv/kv-a`);

		const target = page.locator('[data-sidebar="menu-sub-button"]', {
			hasText: "KV_B",
		});
		await target.waitFor({ state: "visible", timeout: 60_000 });

		// Anything set on `window` survives client-side routing, but is lost
		// when the browser loads a new document.
		await page.evaluate(() => {
			(window as unknown as { __sameDocument: boolean }).__sameDocument = true;
		});

		await target.click();
		await page.waitForURL(`**${LOCAL_EXPLORER_BASE_PATH}/kv/kv-b`, {
			timeout: 30_000,
		});

		const sameDocument = await page.evaluate(
			() =>
				(window as unknown as { __sameDocument?: boolean }).__sameDocument ===
				true
		);
		expect(sameDocument).toBe(true);
	});
});
