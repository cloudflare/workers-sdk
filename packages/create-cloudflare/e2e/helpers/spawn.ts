import { stripAnsi } from "@cloudflare/cli";
import { spawn } from "cross-spawn";
import treeKill from "tree-kill";
import type {
	ChildProcess,
	ChildProcessWithoutNullStreams,
	SpawnOptionsWithoutStdio,
} from "node:child_process";
import type { Writable } from "node:stream";

/**
 * Spawn a child process and attach a handler that will log any output from
 * `stdout` or errors from `stderr` to a dedicated log file.
 *
 * @param args The command and arguments as an array
 * @param opts Additional options to be passed to the `spawn` call
 * @param logStream A write stream to the log file for the test
 * @returns the child process that was created
 */

export const spawnWithLogging = (
	args: string[],
	opts: SpawnOptionsWithoutStdio,
	logStream: Writable,
) => {
	const [cmd, ...argv] = args;

	logStream.write(`\nRunning command: ${[cmd, ...argv].join(" ")}\n\n`);

	const proc = spawn(cmd, argv, {
		...opts,
		env: {
			...testEnv,
			...opts.env,
		},
	});

	proc.stdout.on("data", (data) => {
		const lines: string[] = data.toString().split("\n");

		lines.forEach(async (line) => {
			const stripped = stripAnsi(line).trim();
			if (stripped.length > 0) {
				logStream.write(`${stripped}\n`);
			}
		});
	});

	proc.stderr.on("data", (data) => {
		logStream.write(data);
	});

	return proc;
}; /**
 * An async function that waits on a spawned process to run to completion, collecting
 * any output or errors from `stdout` and `stderr`, respectively.
 *
 * @param proc The child process to wait for
 * @param onData An optional handler to be called on `stdout.on('data')`
 */

export const waitForExit = async (
	proc: ChildProcessWithoutNullStreams,
	onData?: (chunk: string) => void,
) => {
	const stdout: string[] = [];
	const stderr: string[] = [];

	await new Promise((resolve, rejects) => {
		proc.stdout.on("data", (data) => {
			stdout.push(data);
			try {
				if (onData) {
					onData(data);
				}
			} catch (error) {
				// Close the input stream so the process can exit properly
				proc.stdin.end();
				throw error;
			}
		});

		proc.stderr.on("data", (data) => {
			stderr.push(data);
		});

		proc.on("close", (code) => {
			if (code === 0) {
				resolve(null);
			} else {
				rejects({
					code,
					output: stdout.join("\n").trim(),
					errors: stderr.join("\n").trim(),
				});
			}
		});

		proc.on("error", (exitCode) => {
			rejects({
				exitCode,
				output: stdout.join("\n").trim(),
				errors: stderr.join("\n").trim(),
			});
		});
	});

	return {
		output: stdout.join("\n").trim(),
		errors: stderr.join("\n").trim(),
	};
};

export const testEnv = {
	...process.env,
	// The following env vars are set to ensure that package managers
	// do not use the same global cache and accidentally hit race conditions.
	YARN_CACHE_FOLDER: "./.yarn/cache",
	YARN_ENABLE_GLOBAL_CACHE: "false",
	PNPM_HOME: "./.pnpm",
	npm_config_cache: "./.npm/cache",
	// unset the VITEST env variable as this causes e2e issues with some frameworks
	VITEST: undefined,
};

export function kill(proc: ChildProcess) {
	return new Promise<void>(
		(resolve) => proc.pid && treeKill(proc.pid, "SIGINT", () => resolve()),
	);
}
