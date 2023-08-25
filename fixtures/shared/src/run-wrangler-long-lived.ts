import { fork } from "node:child_process";

/**
 * Runs the command `wrangler pages dev` in a child process.
 *
 * Returns an object that gives you access to:
 *
 * - `ip` and `port` of the http-server hosting the pages project
 * - `stop()` function that will close down the server.
 */
export async function runWranglerPagesDev(
	cwd: string,
	publicPath: string,
	options: string[]
) {
	return runLongLivedWrangler(["pages", "dev", publicPath, ...options], cwd);
}

/**
 * Runs the command `wrangler dev` in a child process.
 *
 * Returns an object that gives you access to:
 *
 * - `ip` and `port` of the http-server hosting the pages project
 * - `stop()` function that will close down the server.
 */
export async function runWranglerDev(cwd: string, options: string[]) {
	return runLongLivedWrangler(["dev", ...options], cwd);
}

async function runLongLivedWrangler(command: string[], cwd: string) {
	let settledReadyPromise = false;
	let resolveReadyPromise: (value: { ip: string; port: number }) => void;
	let rejectReadyPromise: (reason: unknown) => void;

	const ready = new Promise<{ ip: string; port: number }>((resolve, reject) => {
		resolveReadyPromise = resolve;
		rejectReadyPromise = reject;
	});

	const wranglerProcess = fork(
		"../../packages/wrangler/bin/wrangler.js",
		command,
		{
			stdio: [/*stdin*/ "ignore", /*stdout*/ "inherit", /*stderr*/ "inherit", "ipc"],
			cwd,
		}
	).on("message", (message) => {
		if (settledReadyPromise) return;
		settledReadyPromise = true;
		clearTimeout(timeoutHandle);
		resolveReadyPromise(JSON.parse(message.toString()));
	});

	const chunks: Buffer[] = [];
	wranglerProcess.stdout?.on("data", (chunk) => chunks.push(chunk));
	wranglerProcess.stderr?.on("data", (chunk) => chunks.push(chunk));

	const timeoutHandle = setTimeout(() => {
		if (settledReadyPromise) return;
		settledReadyPromise = true;
		const separator = "=".repeat(80);
		const message = [
			"Timed out starting long-lived Wrangler:",
			separator,
			Buffer.concat(chunks).toString(),
			separator,
		].join("\n");
		rejectReadyPromise(new Error(message));
	}, 10_000);

	async function stop() {
		return new Promise((resolve, reject) => {
			wranglerProcess.once("exit", (code) => {
				if (!code) {
					resolve(code);
				} else {
					reject(code);
				}
			});
			wranglerProcess.kill("SIGTERM");
		});
	}

	const { ip, port } = await ready;
	return { ip, port, stop };
}
