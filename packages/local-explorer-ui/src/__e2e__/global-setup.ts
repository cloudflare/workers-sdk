import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-chromium";
import { runWranglerDev } from "../../../../fixtures/shared/src/run-wrangler-long-lived";
import type { ChildProcess } from "node:child_process";
import type { BrowserServer } from "playwright-chromium";
import type { TestProject } from "vitest/node";

let browserServer: BrowserServer | undefined;
let viteProcess: ChildProcess | undefined;
let stopWorker: (() => Promise<unknown>) | undefined;

const VITE_PORT = 5173;
const WORKER_PORT = 8787;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = path.resolve(__dirname, "../..");
const ROOT_DIR = path.resolve(__dirname, "../../../..");

/**
 * Wait for a server to be ready by polling the given URL.
 */
async function waitForServer(
	url: string,
	{
		timeout = 30_000,
		interval = 500,
	}: {
		timeout?: number;
		interval?: number;
	} = {}
): Promise<void> {
	const start = Date.now();

	while (Date.now() - start < timeout) {
		try {
			const response = await fetch(url, { method: "HEAD" });

			// Server is ready (404 is ok, means server is responding)
			if (response.ok || response.status === 404) {
				return;
			}
		} catch {
			// Server not ready yet
		}

		await new Promise((resolve) => setTimeout(resolve, interval));
	}

	throw new Error(`Server at ${url} did not become ready within ${timeout}ms`);
}

/**
 * Spawn a process and return it.
 */
function spawnProcess(
	command: string,
	args: Array<string>,
	options: { cwd?: string; env?: Record<string, string> } = {}
): ChildProcess {
	const proc = spawn(command, args, {
		cwd: options.cwd,
		env: { ...process.env, ...options.env },
		shell: true,
		stdio: ["ignore", "pipe", "pipe"],
	});

	// Log output for debugging
	proc.stdout?.on("data", (data: Buffer) => {
		const output = data.toString().trim();
		if (output) {
			console.log(`[${command}] ${output}`);
		}
	});

	proc.stderr?.on("data", (data: Buffer) => {
		const output = data.toString().trim();
		if (output) {
			console.error(`[${command}] ${output}`);
		}
	});

	return proc;
}

export async function setup({ provide }: TestProject): Promise<void> {
	console.log("Starting E2E test environment setup...");

	// Start the worker fixture using the shared helper
	console.log("Starting worker fixture...");
	const fixtureDir = path.resolve(ROOT_DIR, "fixtures/worker-with-resources");

	const { ip, port, stop } = await runWranglerDev(
		fixtureDir,
		[`--port=${WORKER_PORT}`, "--inspector-port=0"],
		{
			X_LOCAL_EXPLORER: "true",
		}
	);
	stopWorker = stop;

	const workerUrl = `http://${ip}:${port}`;
	console.log(`Worker fixture is ready at ${workerUrl}`);

	// Seed the test data
	console.log("Seeding test data...");
	await Promise.all([
		fetch(`${workerUrl}/kv/seed`),
		fetch(`${workerUrl}/d1`),
		fetch(`${workerUrl}/do?id=test-object`),
	]);
	console.log("Test data seeded");

	// Start the Vite dev server
	console.log("Starting Vite dev server...");
	viteProcess = spawnProcess(
		"pnpm",
		["exec", "vite", "--port", String(VITE_PORT)],
		{
			cwd: PACKAGE_DIR,
		}
	);

	// Wait for Vite to be ready
	await waitForServer(`http://localhost:${VITE_PORT}/`);
	console.log("Vite dev server is ready");

	// Launch Playwright browser server
	console.log("Launching browser server...");
	browserServer = await chromium.launchServer({
		args: process.env.CI
			? ["--no-sandbox", "--disable-setuid-sandbox"]
			: undefined,
		headless: true,
	});

	provide("viteUrl", `http://localhost:${VITE_PORT}`);
	provide("workerUrl", workerUrl);
	provide("wsEndpoint", browserServer.wsEndpoint());

	console.log("✅ E2E test environment setup complete");
}

export async function teardown(): Promise<void> {
	console.log("Tearing down E2E test environment...");

	await browserServer?.close();

	if (viteProcess) {
		viteProcess.kill("SIGTERM");
	}

	await stopWorker?.();

	console.log("E2E test teardown complete");
}
