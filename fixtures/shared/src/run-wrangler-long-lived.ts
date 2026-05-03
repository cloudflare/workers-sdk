import assert from "node:assert";
import { fork } from "node:child_process";
import { createConnection } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
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
	let processExited = false;
	let stopping = false;

	const ready = new Promise<{ ip: string; port: number }>((resolve, reject) => {
		resolveReadyPromise = resolve;
		rejectReadyPromise = reject;
	});

	const wranglerProcess = fork(wranglerEntryPath, command, {
		stdio: [/*stdin*/ "ignore", /*stdout*/ "pipe", /*stderr*/ "pipe", "ipc"],
		cwd,
		env: { ...process.env, ...env, PWD: cwd },
	}).on("message", (message) => {
		if (settledReadyPromise) {
			return;
		}
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
		if (process.env.WRANGLER_LOG === "debug") {
			console.log(`[${command}]`, chunk.toString());
		}
		chunks.push(chunk);
	});
	const getOutput = () => Buffer.concat(chunks).toString();
	const clearOutput = () => (chunks.length = 0);

	wranglerProcess.once("exit", (exitCode, signal) => {
		processExited = true;
		if (!settledReadyPromise) {
			settledReadyPromise = true;
			rejectReadyPromise(
				`Wrangler exited with error code: ${exitCode}\nOutput: ${getOutput()}`
			);
			return;
		}
		if (stopping) {
			// Exit was triggered by `stop()` (normal test teardown). No diagnostic
			// needed — the tests are already done.
			return;
		}
		// The process exited *after* we sent back a ready signal — any pending
		// tests will now see ECONNREFUSED. Dump the captured output so CI logs
		// contain the diagnostic info needed to understand what happened.
		const separator = "=".repeat(80);
		console.error(
			[
				`Wrangler process exited unexpectedly after startup (code=${exitCode}, signal=${signal})`,
				`Command: ${command.join(" ")}`,
				separator,
				getOutput(),
				separator,
			].join("\n")
		);
	});

	const timeoutHandle = setTimeout(() => {
		if (settledReadyPromise) {
			return;
		}
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
		stopping = true;
		return new Promise<void>((resolve) => {
			if (processExited) {
				// Already dead — nothing to kill. Avoid noisy Windows taskkill errors.
				resolve();
				return;
			}
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

	// Close the race between Wrangler's IPC "ready" message and the TCP socket
	// actually accepting connections. Without this, tests can run immediately
	// after `beforeAll` returns and hit ECONNREFUSED — especially under CI load
	// when fixtures run in parallel (see ci-flake label for prior art). If the
	// server never starts listening, surface a clear error with captured output
	// instead of letting every test in the suite fail with ECONNREFUSED.
	await waitForServerListening(ip, port, getOutput, () => processExited, stop);

	return { ip, port, stop, getOutput, clearOutput };
}

/**
 * Polls `ip:port` until it accepts a TCP connection, giving up after
 * `totalTimeoutMs`. Throws with a diagnostic message (including the captured
 * Wrangler output) if the server never starts listening or the process exits.
 */
async function waitForServerListening(
	ip: string,
	port: number,
	getOutput: () => string,
	hasExited: () => boolean,
	stop: () => Promise<void>,
	totalTimeoutMs = 10_000
) {
	const deadline = Date.now() + totalTimeoutMs;
	let lastError: unknown;
	while (Date.now() < deadline) {
		if (hasExited()) {
			break;
		}
		try {
			await tryConnect(ip, port);
			return;
		} catch (e) {
			lastError = e;
			await delay(100);
		}
	}
	await stop();
	const separator = "=".repeat(80);
	throw new Error(
		[
			`Wrangler reported ready on ${ip}:${port} but the server is not accepting connections (last error: ${lastError instanceof Error ? lastError.message : String(lastError)})`,
			separator,
			getOutput(),
			separator,
		].join("\n")
	);
}

function tryConnect(ip: string, port: number, timeoutMs = 500): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const socket = createConnection({ host: ip, port });
		const onError = (err: Error) => {
			cleanup();
			reject(err);
		};
		const onConnect = () => {
			cleanup();
			resolve();
		};
		const onTimeout = () => {
			cleanup();
			reject(new Error("TCP connect timed out"));
		};
		const cleanup = () => {
			socket.removeListener("error", onError);
			socket.removeListener("connect", onConnect);
			socket.removeListener("timeout", onTimeout);
			socket.destroy();
		};
		socket.setTimeout(timeoutMs);
		socket.once("error", onError);
		socket.once("connect", onConnect);
		socket.once("timeout", onTimeout);
	});
}
