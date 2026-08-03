import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { Writable } from "node:stream";
import { configFileName, UserError } from "@cloudflare/workers-utils";
import chalk from "chalk";
import { execaCommand } from "execa";
import treeKill from "tree-kill";
import dedent from "ts-dedent";
import { logger } from "../logger";
import type { Config } from "@cloudflare/workers-utils";
import type { ExecaChildProcess } from "execa";

export type WranglerCommand = "dev" | "deploy" | "versions upload" | "types";

type RunCommandOptions = {
	wranglerCommand?: WranglerCommand;
	signal?: AbortSignal;
};

const FORCE_KILL_AFTER_MS = 5_000;

export async function runCommand(
	command: string,
	cwd: string | undefined,
	prefix = "[custom build]",
	runOptions?: RunCommandOptions
) {
	logger.log(chalk.blue(prefix), "Running:", command);
	let abortHandler: ReturnType<typeof terminateProcessOnAbort> | undefined;
	try {
		const res = execaCommand(command, {
			shell: true,
			cwd,
			env: {
				...process.env,
				...(runOptions?.wranglerCommand
					? { WRANGLER_COMMAND: runOptions.wranglerCommand }
					: {}),
			},
		});
		abortHandler = terminateProcessOnAbort(runOptions?.signal, res);
		res.stdout?.pipe(
			new Writable({
				write(chunk: Buffer, _, callback) {
					const lines = chunk.toString().split("\n");
					for (const line of lines) {
						logger.log(chalk.blue(prefix), line);
					}
					callback();
				},
			})
		);
		res.stderr?.pipe(
			new Writable({
				write(chunk: Buffer, _, callback) {
					const lines = chunk.toString().split("\n");
					for (const line of lines) {
						logger.log(chalk.red(prefix), line);
					}
					callback();
				},
			})
		);
		await res;
		if (runOptions?.signal?.aborted) {
			await abortHandler?.waitForExit();
		}
	} catch (e) {
		if (runOptions?.signal?.aborted) {
			await abortHandler?.waitForExit();
			throw e;
		}
		logger.error(e);
		throw new UserError(
			`Running custom build \`${command}\` failed. There are likely more logs from your build command above.`,
			{
				telemetryMessage: "custom build failed",
				cause: e,
			}
		);
	} finally {
		abortHandler?.cleanup();
	}
}
/**
 * Run the custom build step, if one was provided.
 *
 * This function will also check whether the expected entry-point exists
 * once any custom build has run.
 */
export async function runCustomBuild(
	expectedEntryAbsolute: string,
	expectedEntryRelative: string,
	build: Pick<Config["build"], "command" | "cwd">,
	configPath: string | undefined,
	runOptions?: RunCommandOptions
) {
	if (build.command) {
		await runCommand(build.command, build.cwd, "[custom build]", runOptions);

		assertEntryPointExists(
			expectedEntryAbsolute,
			expectedEntryRelative,
			build.command,
			configPath
		);
	} else {
		assertEntryPointExists(expectedEntryAbsolute, expectedEntryRelative);
	}
}

/**
 * Throws an error if the given entry point file does not exist.
 */
function assertEntryPointExists(
	expectedEntryAbsolute: string,
	expectedEntryRelative: string,
	customBuildCommand?: string,
	configPath?: string
) {
	if (!fileExists(expectedEntryAbsolute)) {
		throw new UserError(
			getMissingEntryPointMessage(
				expectedEntryAbsolute,
				expectedEntryRelative,
				customBuildCommand,
				configPath
			),
			{ telemetryMessage: "missing entrypoint after custom build" }
		);
	}
}

/**
 * Terminate a spawned custom build command (and any processes it spawned) when
 * the given `signal` aborts.
 *
 * `tree-kill` sends the signal to the process and all of its descendants on both
 * POSIX and Windows. This matters because custom build commands are run through
 * a shell and typically spawn their own child processes (e.g. `npm run build`).
 * Killing the whole tree both terminates those children and closes the stdio
 * pipes they inherited — without the latter, the `execa` promise would hang
 * waiting for the pipes to reach EOF.
 */
function terminateProcessOnAbort(
	signal: AbortSignal | undefined,
	subprocess: ExecaChildProcess
) {
	let processExitPromise: Promise<void> | undefined;
	let forceKillTimer: NodeJS.Timeout | undefined;
	const terminate = () => {
		signal?.removeEventListener("abort", terminate);
		const pid = subprocess.pid;
		if (pid === undefined) {
			return;
		}
		processExitPromise ??= new Promise<void>((resolve) => {
			treeKill(pid, "SIGTERM", (error) => {
				if (error) {
					logger.debug("Failed to kill custom build process tree", error);
				}
				resolve();
			});
		});
		// If the process tree ignores SIGTERM (and keeps stdio pipes open, which
		// would otherwise hang the `execa` promise), escalate to SIGKILL after a
		// grace period. The timer is cleared in `cleanup()` once the command has
		// settled, so SIGKILL is only sent to a process tree that refused to exit.
		forceKillTimer ??= setTimeout(() => {
			treeKill(pid, "SIGKILL", (error) => {
				if (error) {
					logger.debug("Failed to force kill custom build process tree", error);
				}
			});
		}, FORCE_KILL_AFTER_MS);
	};
	if (signal?.aborted) {
		terminate();
	} else {
		signal?.addEventListener("abort", terminate);
	}

	return {
		cleanup() {
			signal?.removeEventListener("abort", terminate);
			if (forceKillTimer !== undefined) {
				clearTimeout(forceKillTimer);
				forceKillTimer = undefined;
			}
		},
		waitForExit() {
			return processExitPromise ?? Promise.resolve();
		},
	};
}

/**
 * Generate an appropriate message for when the entry-point is missing.
 *
 * To be more helpful to developers, we check whether there is a suitable file
 * nearby to the expected file path.
 */
function getMissingEntryPointMessage(
	absoluteEntryPointPath: string,
	relativeEntryPointPath: string,
	customBuildCommand?: string,
	configPath?: string
): string {
	if (
		existsSync(absoluteEntryPointPath) &&
		statSync(absoluteEntryPointPath).isDirectory()
	) {
		// The expected entry-point is a directory, so offer further guidance.
		let message = `The provided entry-point path, "${relativeEntryPointPath}", points to a directory, rather than a file.\n`;

		// Perhaps we can even guess what the correct path should be...
		const possiblePaths: string[] = [];
		for (const basenamePath of [
			"worker",
			"dist/worker",
			"index",
			"dist/index",
		]) {
			for (const extension of [".ts", ".tsx", ".js", ".jsx"]) {
				const filePath = basenamePath + extension;
				if (fileExists(path.resolve(absoluteEntryPointPath, filePath))) {
					possiblePaths.push(path.join(relativeEntryPointPath, filePath));
				}
			}
		}

		if (possiblePaths.length > 0) {
			message +=
				`\nDid you mean to set the main field to${
					possiblePaths.length > 1 ? " one of" : ""
				}:\n` +
				"```\n" +
				possiblePaths.map((filePath) => `main = "./${filePath}"\n`).join("") +
				"```";
		} else {
			message +=
				`\n If you want to deploy a directory of static assets, you can do so by using the \`--assets\` flag. For example:\n\n` +
				`wrangler deploy --assets=./${relativeEntryPointPath}\n`;
		}

		return message;
	}

	if (customBuildCommand) {
		return dedent`
			The expected output file at "${relativeEntryPointPath}" was not found after running custom build: ${customBuildCommand}.
			The \`main\` property in your ${configFileName(configPath)} file should point to the file generated by the custom build.
		`;
	}

	return dedent`
			The entry-point file at "${relativeEntryPointPath}" was not found.

			This might mean that your entry-point file needs to be generated (which is the general case when a framework is being used).
			If that's the case please run your project's build command and try again.
		`;
}

/**
 * Returns true if the given `filePath` exists as-is,
 * or if some version of it (by appending a common extension) exists.
 */

function fileExists(filePath: string): boolean {
	const SOURCE_FILE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
	if (path.extname(filePath) !== "") {
		return existsSync(filePath);
	}
	const base = path.join(path.dirname(filePath), path.basename(filePath));
	for (const ext of SOURCE_FILE_EXTENSIONS) {
		if (existsSync(base + ext)) {
			return true;
		}
	}
	return false;
}
