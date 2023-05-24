import { fork } from "node:child_process";

/**
 * Runs the command `triangle pages dev` in a child process.
 *
 * Returns an object that gives you access to:
 *
 * - `ip` and `port` of the http-server hosting the pages project
 * - `stop()` function that will close down the server.
 */
export async function runTrianglePagesDev(
	cwd: string,
	publicPath: string,
	options: string[]
) {
	return runLongLivedTriangle(["pages", "dev", publicPath, ...options], cwd);
}

/**
 * Runs the command `triangle dev` in a child process.
 *
 * Returns an object that gives you access to:
 *
 * - `ip` and `port` of the http-server hosting the pages project
 * - `stop()` function that will close down the server.
 */
export async function runTriangleDev(cwd: string, options: string[]) {
	return runLongLivedTriangle(["dev", ...options], cwd);
}

async function runLongLivedTriangle(command: string[], cwd: string) {
	let resolveReadyPromise: (value: { ip: string; port: number }) => void;

	const ready = new Promise<{ ip: string; port: number }>(
		(resolve) => (resolveReadyPromise = resolve)
	);

	const triangleProcess = fork(
		"../../packages/triangle/bin/triangle.js",
		command,
		{
			stdio: ["ignore", "ignore", "ignore", "ipc"],
			cwd,
		}
	).on("message", (message) => {
		resolveReadyPromise(JSON.parse(message.toString()));
	});

	async function stop() {
		return new Promise((resolve, reject) => {
			triangleProcess.once("exit", (code) => {
				if (!code) {
					resolve(code);
				} else {
					reject(code);
				}
			});
			triangleProcess.kill("SIGTERM");
		});
	}

	const { ip, port } = await ready;
	return { ip, port, stop };
}
