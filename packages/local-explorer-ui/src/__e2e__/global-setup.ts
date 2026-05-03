import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-chromium";
import { createServer } from "vite";
import { runWranglerDev } from "../../../../fixtures/shared/src/run-wrangler-long-lived";
import type { BrowserServer } from "playwright-chromium";
import type { ViteDevServer } from "vite";
import type { TestProject } from "vitest/node";

let browserServer: BrowserServer | undefined;
let viteServer: ViteDevServer | undefined;
let stopWorker: (() => Promise<unknown>) | undefined;

const WORKER_PORT = 8787;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = path.resolve(__dirname, "../..");
const ROOT_DIR = path.resolve(__dirname, "../../../..");

export async function setup({ provide }: TestProject): Promise<void> {
	console.log("Starting E2E test environment setup...");

	// Start the worker fixture using the shared helper
	console.log("Starting worker fixture...");
	const fixtureDir = path.resolve(ROOT_DIR, "fixtures/worker-with-resources");

	const { ip, port, stop } = await runWranglerDev(
		fixtureDir,
		[`--port=${WORKER_PORT}`, "--inspector-port=0"],
		{ X_LOCAL_EXPLORER: "true" }
	);
	stopWorker = stop;

	const workerUrl = `http://${ip}:${port}`;
	console.log(`Worker fixture is ready at ${workerUrl}`);

	// Start the Vite dev server programmatically
	console.log("Starting Vite dev server...");
	viteServer = await createServer({
		root: PACKAGE_DIR,
	});
	await viteServer.listen();
	console.log(
		`Vite dev server is ready at http://localhost:${viteServer.config.server.port}`
	);

	// Launch Playwright browser server
	console.log("Launching browser server...");
	browserServer = await chromium.launchServer({
		args: process.env.CI
			? ["--no-sandbox", "--disable-setuid-sandbox"]
			: undefined,
		headless: true,
	});

	provide("viteUrl", `http://localhost:${viteServer.config.server.port}`);
	provide("workerUrl", workerUrl);
	provide("wsEndpoint", browserServer.wsEndpoint());

	console.log("E2E test environment setup complete");
}

export async function teardown(): Promise<void> {
	console.log("Tearing down E2E test environment...");

	await browserServer?.close();
	await viteServer?.close();
	await stopWorker?.();

	console.log("E2E test teardown complete");
}
