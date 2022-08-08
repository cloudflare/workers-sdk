import { spawn } from "node:child_process";
import { fetch } from "undici";
import type { Response } from "undici";

const isWindows = process.platform === "win32";

export async function sleep(ms: number): Promise<void> {
	await new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

/**
 * Spawn a child process that is running `wrangler dev`.
 *
 * @returns two helper functions:
 * - `fetchWhenReady()` will run a fetch against the preview Worker, once it is up and running,
 *   and return its response.
 * - `terminateProcess()` send a signal to the `wrangler dev` child process to kill itself.
 */
export function spawnWranglerDev(
	srcPath: string,
	wranglerTomlPath: string,
	port: number
) {
	const wranglerProcess = spawn(
		"npx",
		[
			"wrangler",
			"dev",
			srcPath,
			"--local",
			"--config",
			wranglerTomlPath,
			"--port",
			port.toString(),
		],
		{
			shell: isWindows,
			stdio: "pipe",
		}
	);

	const fetchWhenReady = async (url: string): Promise<Response> => {
		const MAX_ATTEMPTS = 50;
		const SLEEP_MS = 100;
		let attempts = MAX_ATTEMPTS;
		while (attempts-- > 0) {
			await sleep(SLEEP_MS);
			try {
				return await fetch(`${url}:${port}`);
			} catch {}
		}
		throw new Error(
			`Failed to connect to "${url}:${port}" within ${
				(MAX_ATTEMPTS * SLEEP_MS) / 1000
			} seconds.`
		);
	};

	const terminateProcess = () => {
		return new Promise((resolve, reject) => {
			wranglerProcess.once("exit", (code) => {
				if (!code) {
					resolve(code);
				} else {
					reject(code);
				}
			});
			wranglerProcess.kill();
		});
	};

	return {
		wranglerProcess,
		fetchWhenReady,
		terminateProcess,
	};
}
