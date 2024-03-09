import { stripAnsi } from "@cloudflare/cli";
import { isInteractive, spinner } from "@cloudflare/cli/interactive";
import { spawn } from "cross-spawn";
import { quoteShellArgs } from "../common";

/**
 * Command is a string array, like ['git', 'commit', '-m', '"Initial commit"']
 */
type Command = string[];

type RunOptions = {
	startText?: string;
	doneText?: string | ((output: string) => string);
	silent?: boolean;
	captureOutput?: boolean;
	useSpinner?: boolean;
	env?: NodeJS.ProcessEnv;
	cwd?: string;
	/** If defined this function is called to all you to transform the output from the command into a new string. */
	transformOutput?: (output: string) => string;
};

type MultiRunOptions = RunOptions & {
	commands: Command[];
	startText: string;
};

type PrintOptions<T> = {
	promise: Promise<T> | (() => Promise<T>);
	useSpinner?: boolean;
	startText: string;
	doneText?: string | ((output: T) => string);
};

/**
 * An awaitable wrapper around `spawn` that optionally displays progress to user and process output capture.
 *
 * @param command - The command to run as an array of strings
 * @param opts.silent - Should the command's stdout and stderr be dispalyed to the user
 * @param opts.captureOutput - Should the output of the command the returned as a string.
 * @param opts.env - An object of environment variables to be injected when running the command
 * @param opts.cwd - The directory in which the command should be run
 * @param opts.useSpinner - Should a spinner be shown when running the command
 * @param opts.startText - Spinner start text
 * @param opts.endText - Spinner end text
 * @param opts.transformOutput - A transformer to be run on command output before returning
 *
 * @returns Output collected from the stdout of the command, if `captureOutput` was set to true. Otherwise `null`.
 */
export const runCommand = async (
	command: Command,
	opts: RunOptions = {}
): Promise<string> => {
	return printAsyncStatus({
		useSpinner: opts.useSpinner ?? opts.silent,
		startText: opts.startText || quoteShellArgs(command),
		doneText: opts.doneText,
		promise() {
			const [executable, ...args] = command;

			const cmd = spawn(executable, [...args], {
				// TODO: ideally inherit stderr, but npm install uses this for warnings
				// stdio: [ioMode, ioMode, "inherit"],
				stdio: opts.silent ? "pipe" : "inherit",
				env: {
					...process.env,
					...opts.env,
				},
				cwd: opts.cwd,
			});

			let output = ``;

			if (opts.captureOutput ?? opts.silent) {
				cmd.stdout?.on("data", (data) => {
					output += data;
				});
				cmd.stderr?.on("data", (data) => {
					output += data;
				});
			}

			return new Promise<string>((resolvePromise, reject) => {
				cmd.on("close", (code) => {
					try {
						if (code !== 0) {
							throw new Error(output, { cause: code });
						}

						// Process any captured output
						const transformOutput =
							opts.transformOutput ?? ((result: string) => result);
						const processedOutput = transformOutput(stripAnsi(output));

						// Send the captured (and processed) output back to the caller
						resolvePromise(processedOutput);
					} catch (e) {
						// Something went wrong.
						// Perhaps the command or the transform failed.
						reject(new Error(output, { cause: e }));
					}
				});

				cmd.on("error", (code) => {
					reject(code);
				});
			});
		},
	});
};

/**
 * Run multiple commands in sequence (not parallel)
 */
export async function runCommands({ commands, ...opts }: MultiRunOptions) {
	return printAsyncStatus({
		useSpinner: opts.useSpinner ?? opts.silent,
		startText: opts.startText,
		doneText: opts.doneText,
		async promise() {
			const results = [];
			for (const command of commands) {
				results.push(await runCommand(command, { ...opts, useSpinner: false }));
			}
			return results.join("\n");
		},
	});
}

export const printAsyncStatus = async <T>({
	promise,
	...opts
}: PrintOptions<T>): Promise<T> => {
	let s: ReturnType<typeof spinner> | undefined;

	if (opts.useSpinner && isInteractive()) {
		s = spinner();
	}

	s?.start(opts?.startText);

	if (typeof promise === "function") {
		promise = promise();
	}

	try {
		const output = await promise;

		const doneText =
			typeof opts.doneText === "function"
				? opts.doneText(output)
				: opts.doneText;
		s?.stop(doneText);
	} catch (err) {
		s?.stop((err as Error).message);
	} finally {
		s?.stop();
	}

	return promise;
};
