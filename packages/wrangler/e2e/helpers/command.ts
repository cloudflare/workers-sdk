import assert from "node:assert";
import { spawn, spawnSync } from "node:child_process";
import events from "node:events";
import rl from "node:readline";
import { PassThrough } from "node:stream";
import { ReadableStream } from "node:stream/web";
import { setTimeout } from "node:timers/promises";
import treeKill from "tree-kill";
import dedent from "ts-dedent";
import { readUntil } from "./read-until";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

const DEFAULT_TIMEOUT = 50_000;

export type CommandOptions = {
	cwd?: string;
	env?: typeof process.env;
	timeout?: number;
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
	{ cwd, env, timeout = DEFAULT_TIMEOUT }: CommandOptions = {}
) {
	try {
		const { status, stdout, stderr } = spawnSync(command, [], {
			shell: true,
			cwd,
			stdio: "pipe",
			env,
			encoding: "utf8",
			timeout,
		});
		// eslint-disable-next-line turbo/no-undeclared-env-vars
		if (process.env.VITEST_MODE === "WATCH") {
			if (stdout.length) {
				console.log(stdout);
			}
			if (stderr.length) {
				console.error(stderr);
			}
		}
		return { status, stdout, stderr };
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
	private exitPromise: Promise<unknown>;
	private commandProcess: ChildProcessWithoutNullStreams;

	constructor(
		private command: string,
		{ cwd, env, timeout }: CommandOptions
	) {
		const signal = createTimeoutSignal(timeout);
		this.commandProcess = spawn(command, [], {
			shell: true,
			cwd,
			stdio: "pipe",
			env,
			signal,
		});

		this.exitPromise = events.once(this.commandProcess, "exit");

		// Merge the stdout and stderr into a single output stream
		const output = new PassThrough();
		this.commandProcess.stdout.pipe(output);
		this.commandProcess.stderr.pipe(output);

		const lineInterface = rl.createInterface(output);
		this.stream = new ReadableStream<string>({
			start: (controller) => {
				lineInterface.on("line", (line) => {
					// eslint-disable-next-line turbo/no-undeclared-env-vars
					if (process.env.VITEST_MODE === "WATCH") {
						console.log(line);
					}
					this.lines.push(line);
					try {
						controller.enqueue(line);
					} catch {
						// occasionally the enqueue can throw if the stream has already been closed
						// but we don't care and can just move on.
					}
				});
				void this.exitPromise
					.catch(() =>
						this.lines.unshift(`Failed to run ${JSON.stringify(command)}:`)
					)
					.finally(() => controller.close());
			},
			cancel() {
				lineInterface.close();
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
		return this.exitPromise;
	}

	async stop() {
		return new Promise<void>((resolve) => {
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
				}
				resolve();
			});
		});
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
