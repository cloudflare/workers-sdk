import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import getPort from "get-port";

const STARTUP_TIMEOUT = 60_000;

let devServer: ChildProcess | undefined;
let devServerError: Error | undefined;
let devServerOutput = "";

function captureDevServerOutput(chunk: string): void {
	devServerOutput = (devServerOutput + chunk).slice(-20_000);
}

async function waitForDevServer(
	baseUrl: string,
	child: ChildProcess
): Promise<void> {
	const deadline = Date.now() + STARTUP_TIMEOUT;

	while (Date.now() < deadline) {
		if (devServerError) {
			throw new Error("Unable to start the Flue eval server.", {
				cause: devServerError,
			});
		}

		if (child.exitCode !== null || child.signalCode !== null) {
			throw new Error(
				`The Flue eval server exited before it was ready.\n${devServerOutput}`
			);
		}

		try {
			const response = await fetch(baseUrl, {
				signal: AbortSignal.timeout(1_000),
			});
			await response.body?.cancel();
			return;
		} catch {
			// Note: There is a delay on startup while we wait for the remote connection
			await sleep(100);
		}
	}

	throw new Error(
		`Timed out waiting for the Flue eval server.\n${devServerOutput}`
	);
}

function waitForExit(child: ChildProcess): Promise<void> {
	return new Promise((resolve) => {
		child.once("exit", () => resolve());
	});
}

export async function setup(): Promise<void> {
	const bearerToken = randomBytes(32).toString("hex");
	const port = await getPort();
	const baseUrl = `http://127.0.0.1:${port}`;
	const args = ["dev", "--port", String(port)];

	process.env.FLUE_BASE_URL = baseUrl;
	process.env.FLUE_EVALS_BEARER_TOKEN = bearerToken;

	console.log(`[flue evals] Starting development server at ${baseUrl}...`);
	devServer = spawn("flue", args, {
		env: {
			...process.env,
			FLUE_EVALS_BEARER_TOKEN: bearerToken,
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	devServer.once("error", (error) => {
		devServerError = error;
	});
	devServer.stdout?.setEncoding("utf8");
	devServer.stdout?.on("data", captureDevServerOutput);
	devServer.stderr?.setEncoding("utf8");
	devServer.stderr?.on("data", captureDevServerOutput);

	await waitForDevServer(baseUrl, devServer);
	console.log(`[flue evals] Development server ready at ${baseUrl}.`);
}

export async function teardown(): Promise<void> {
	if (!devServer || devServer.exitCode !== null) {
		return;
	}

	console.log("[flue evals] Stopping development server...");
	const exit = waitForExit(devServer);
	devServer.kill("SIGTERM");
	await Promise.race([exit, sleep(5_000)]);

	if (devServer.exitCode === null && devServer.signalCode === null) {
		console.warn("[flue evals] Development server did not stop; killing it.");
		devServer.kill("SIGKILL");
		await exit;
	}

	console.log("[flue evals] Development server stopped.");
}
