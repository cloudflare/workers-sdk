import assert from "node:assert";
import { fork } from "node:child_process";
import events from "node:events";
import path from "node:path";
import treeKill from "tree-kill";

export const wranglerEntryPath = path.resolve(
	__dirname,
	"../../../packages/wrangler/bin/wrangler.js"
);

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
	publicPath: string | undefined,
	options: string[],
	env?: NodeJS.ProcessEnv
) {
	if (publicPath) {
		return runLongLivedWrangler(
			["pages", "dev", publicPath, "--ip=127.0.0.1", ...options],
			cwd,
			env
		);
	} else {
		return runLongLivedWrangler(
			["pages", "dev", "--ip=127.0.0.1", ...options],
			cwd,
			env
		);
	}
}

/**
 * Runs the command `wrangler dev` in a child process.
 *
 * Returns an object that gives you access to:
 *
 * - `ip` and `port` of the http-server hosting the pages project
 * - `stop()` function that will close down the server.
 */
export async function runWranglerDev(
	cwd: string,
	options: string[],
	env?: NodeJS.ProcessEnv
) {
	return runLongLivedWrangler(["dev", "--ip=127.0.0.1", ...options], cwd, env);
}

async function runLongLivedWrangler(
	command: string[],
	cwd: string,
	env?: NodeJS.ProcessEnv
) {
	let settledReadyPromise = false;
	let resolveReadyPromise: (value: { ip: string; port: number }) => void;
	let rejectReadyPromise: (reason: unknown) => void;

	const ready = new Promise<{ ip: string; port: number }>((resolve, reject) => {
		resolveReadyPromise = resolve;
		rejectReadyPromise = reject;
	});

	const wranglerProcess = fork(wranglerEntryPath, command, {
		stdio: [/*stdin*/ "ignore", /*stdout*/ "pipe", /*stderr*/ "pipe", "ipc"],
		cwd,
		env: { ...process.env, ...env, PWD: cwd },
	}).on("message", (message) => {
		if (settledReadyPromise) return;
		settledReadyPromise = true;
		clearTimeout(timeoutHandle);
		resolveReadyPromise(JSON.parse(message.toString()));
	});

	const chunks: Buffer[] = [];
	wranglerProcess.stdout?.on("data", (chunk) => {
		if (process.env.WRANGLER_LOG === "debug") {
			console.log(`[${command}]`, chunk.toString());
		}
		chunks.push(chunk);
	});
	wranglerProcess.stderr?.on("data", (chunk) => {
		console.log(`[${command}]`, chunk.toString());
		chunks.push(chunk);
	});
	wranglerProcess.once("exit", (exitCode) => {
		if (exitCode !== 0) {
			rejectReadyPromise(
				`Wrangler exited with error code: ${exitCode}\nOutput: ${getOutput()}`
			);
		}
	});
	const getOutput = () => Buffer.concat(chunks).toString();
	const clearOutput = () => (chunks.length = 0);

	const timeoutHandle = setTimeout(() => {
		if (settledReadyPromise) return;
		settledReadyPromise = true;
		const separator = "=".repeat(80);
		const message = [
			"Timed out starting long-lived Wrangler:",
			separator,
			getOutput(),
			separator,
		].join("\n");
		rejectReadyPromise(new Error(message));
	}, 50_000);

	async function stop() {
		return new Promise<void>((resolve) => {
			assert(
				wranglerProcess.pid,
				`Command "${command.join(" ")}" had no process id`
			);
			treeKill(wranglerProcess.pid, (e) => {
				if (e) {
					console.error(
						"Failed to kill command: " + command.join(" "),
						wranglerProcess.pid,
						e
					);
				}
				// fallthrough to resolve() because either the process is already dead
				// or don't have permission to kill it or some other reason?
				// either way, there is nothing we can do and we don't want to fail the test because of this
				resolve();
			});
		});
	}

	const { ip, port } = await ready;
	return { ip, port, stop, getOutput, clearOutput, wranglerProcess };
}
