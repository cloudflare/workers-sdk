import assert from "node:assert";
import { spawn, spawnSync } from "node:child_process";
import events from "node:events";
import path from "node:path";
import rl from "node:readline";
import { ReadableStream } from "node:stream/web";
import { setTimeout } from "node:timers/promises";
import treeKill from "tree-kill";
import dedent from "ts-dedent";
import { readUntil } from "./read-until";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

const DEFAULT_TIMEOUT = 50_000;
const OUTPUT_DRAIN_TIMEOUT = 1_000;

export type CommandOptions = {
	cwd?: string;
	env?: typeof process.env;
	timeout?: number;
	/** Capture output without logging it, for best-effort cleanup commands. */
	silent?: boolean;
};

/**
 * Run a command till it exits and return its status and output.
 *
 * Options:
 *  - If you specify a timeout the command will abort if it runs too long.
 *  - Override the current working directory or env vars (if not provided it just inherits from the current process).
 *
 * Returns the result (status, stdout and stderr) from running the command.
 */
export function runCommand(
	command: string,
	{ cwd, env, timeout = DEFAULT_TIMEOUT, silent = false }: CommandOptions = {}
) {
	try {
		if (!silent) {
			console.log(`Running command: ${command}`);
		}
		const { status, stdout, stderr, output } = spawnSync(command, [], {
			shell: true,
			cwd,
			stdio: "pipe",
			env,
			encoding: "utf8",
			timeout,
		});
		if (!silent && stdout.length) {
			console.log(`[${path.basename(cwd ?? "/unknown")}]`, stdout);
		}
		if (!silent && stderr.length) {
			console.error(`[${path.basename(cwd ?? "/unknown")}]`, stderr);
		}

		return {
			status,
			stdout,
			stderr,
			output: output.filter((line) => line !== null).join("\n"),
		};
	} catch (e) {
		if (isTimedOutError(e)) {
			throw new Error(dedent`
				Running ${JSON.stringify(command)} took too long (${timeout}).
				stdout: ${e.stdout}
				stderr: ${e.stderr}
				`);
		} else {
			throw e;
		}
	}
}

/**
 * Run a long-lived command that does not exit.
 *
 * Options:
 *  - If you specify a timeout the command will abort if it runs too long.
 *  - Override the current working directory or env vars (if not provided it just inherits from the current process).
 */
export class LongLivedCommand {
	private lines: string[] = [];
	private stream: ReadableStream;
	private exitPromise: Promise<[number | null, NodeJS.Signals | null]>;
	private commandProcess: ChildProcessWithoutNullStreams;

	constructor(
		private command: string,
		{ cwd, env, timeout, silent = false }: CommandOptions
	) {
		const signal = createTimeoutSignal(timeout);
		this.commandProcess = spawn(command, [], {
			shell: true,
			cwd,
			stdio: "pipe",
			env,
			signal,
		});

		// An AbortError can arrive before Windows reports process termination.
		// Keep listening for exit so callers cannot race teardown against it.
		const processExited = new Promise<void>((resolve) => {
			this.commandProcess.once("exit", () => resolve());
		});
		const exitPromise = (
			events.once(this.commandProcess, "exit") as Promise<
				[number | null, NodeJS.Signals | null]
			>
		).catch(async (error: unknown) => {
			// Spawn failures have no process to wait for.
			if (signal?.aborted && this.commandProcess.pid !== undefined) {
				await processExited;
			}
			throw error;
		});

		// Read each pipe independently so closing stdout cannot discard later stderr.
		const lineInterfaces = [
			rl.createInterface(this.commandProcess.stdout),
			rl.createInterface(this.commandProcess.stderr),
		];
		const outputClosed = Promise.all(
			lineInterfaces.map((lineInterface) => events.once(lineInterface, "close"))
		);
		// Drain buffered output after exit, but don't wait indefinitely for pipes
		// inherited by a background child that outlives the command.
		const drainController = new AbortController();
		const drainTimeout = exitPromise.then(() =>
			setTimeout(OUTPUT_DRAIN_TIMEOUT, undefined, {
				signal: drainController.signal,
			})
		);
		this.exitPromise = Promise.all([
			exitPromise,
			Promise.race([outputClosed, drainTimeout]),
		])
			.then(([status]) => status)
			.finally(() => {
				drainController.abort();
				for (const lineInterface of lineInterfaces) {
					lineInterface.close();
				}
				this.commandProcess.stdout.destroy();
				this.commandProcess.stderr.destroy();
			});

		this.stream = new ReadableStream<string>({
			start: (controller) => {
				for (const lineInterface of lineInterfaces) {
					lineInterface.on("line", (line) => {
						if (!silent) {
							console.log(`[${path.basename(cwd ?? "/unknown")}]`, line);
						}
						this.lines.push(line);
						try {
							controller.enqueue(line);
						} catch {
							// occasionally the enqueue can throw if the stream has already been closed
							// but we don't care and can just move on.
						}
					});
				}
				void this.exitPromise
					.catch(() =>
						this.lines.unshift(`Failed to run ${JSON.stringify(command)}:`)
					)
					.finally(() => controller.close());
			},
			cancel() {
				for (const lineInterface of lineInterfaces) {
					lineInterface.close();
				}
			},
		});
	}

	// Wait for changes in the output of this process.
	async readUntil(
		regexp: RegExp,
		readTimeout?: number
	): Promise<RegExpMatchArray> {
		return readUntil(this.stream, regexp, readTimeout);
	}

	// Return a snapshot of the output so far
	get currentOutput() {
		return this.lines.join("\n");
	}

	get output() {
		return this.exitPromise.then(() => this.lines.join("\n"));
	}

	get exitCode() {
		return this.exitPromise.then((e) => e[0]);
	}

	async stop() {
		if (
			this.commandProcess.exitCode !== null ||
			this.commandProcess.signalCode !== null
		) {
			await this.exitPromise.catch(() => {});
			return;
		}
		await new Promise<void>((resolve) => {
			assert(
				this.commandProcess.pid,
				`Command "${this.command}" had no process id`
			);
			treeKill(this.commandProcess.pid, (e) => {
				if (e) {
					console.error(
						"Failed to kill command: " + this.command,
						this.commandProcess.pid,
						e
					);
					// fallthrough to resolve() because either the process is already dead
					// or don't have permission to kill it or some other reason?
					// either way, there is nothing we can do and we don't want to fail the test because of this
				}
				resolve();
			});
		});
		// Wait for the process to actually exit so that ports are fully released
		// before the next test starts. Without this, the next test may encounter
		// EADDRINUSE because the dying process still holds the port.
		await this.exitPromise.catch(() => {});
	}

	async signal(signal: NodeJS.Signals) {
		return this.commandProcess.kill(signal);
	}
}

interface TimedOutError extends Error {
	code: "ETIMEDOUT";
	stdout: string;
	stderr: string;
}
function isTimedOutError(e: unknown): e is TimedOutError {
	return e instanceof Error && "code" in e && e.code === "ETIMEDOUT";
}

function createTimeoutSignal(timeout: number | undefined) {
	if (timeout === undefined) {
		return undefined;
	}
	const ctrl = new AbortController();
	void setTimeout(timeout).then(() => ctrl.abort());
	return ctrl.signal;
}
