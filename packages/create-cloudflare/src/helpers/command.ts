import { stripAnsi } from "@cloudflare/cli";
import { CancelError } from "@cloudflare/cli/error";
import { isInteractive, spinner } from "@cloudflare/cli/interactive";
import { spawn } from "cross-spawn";

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

type PrintOptions<T> = {
	promise: Promise<T> | (() => Promise<T>);
	useSpinner?: boolean;
	startText: string;
	doneText?: string | ((output: T) => string);
};

/**
 * An awaitable wrapper around `spawn` that optionally displays progress to user and processes/captures the command's output
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
	opts: RunOptions = {},
): Promise<string> => {
	return printAsyncStatus({
		useSpinner: opts.useSpinner ?? opts.silent,
		startText: opts.startText || quoteShellArgs(command),
		doneText: opts.doneText,
		promise() {
			const [executable, ...args] = command;
			const abortController = new AbortController();
			const cmd = spawn(executable, [...args], {
				// TODO: ideally inherit stderr, but npm install uses this for warnings
				// stdio: [ioMode, ioMode, "inherit"],
				stdio: opts.silent ? "pipe" : "inherit",
				env: {
					...process.env,
					...opts.env,
				},
				cwd: opts.cwd,
				signal: abortController.signal,
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

			let cleanup: (() => void) | null = null;

			return new Promise<string>((resolvePromise, reject) => {
				const cancel = (signal?: NodeJS.Signals) => {
					reject(new CancelError(`Command cancelled`, signal));
					abortController.abort(signal ? `${signal} received` : null);
				};

				process.on("SIGTERM", cancel).on("SIGINT", cancel);

				// To cleanup the signal listeners when the promise settles
				cleanup = () => {
					process.off("SIGTERM", cancel).off("SIGINT", cancel);
				};

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

				cmd.on("error", (error) => {
					reject(error);
				});
			}).finally(() => {
				cleanup?.();
			});
		},
	});
};

const printAsyncStatus = async <T>({
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

/**
 * Formats an array of command line arguments to be displayed to the user
 * in a platform safe way. Args used in conjunction with `runCommand` are safe
 * since we use `cross-spawn` to handle multi-platform support.
 *
 * However, when we output commands to the user, we have to make sure that they
 * are compatible with the platform they are using.
 *
 * @param args - The arguments to format to the user
 */
export function quoteShellArgs(args: string[]): string {
	if (process.platform === "win32") {
		// Simple Windows command prompt quoting if there are special characters.
		const specialCharsMatcher = /[&<>[\]|{}^=;!'+,`~\s]/;
		return args
			.map((arg) =>
				arg.match(specialCharsMatcher) ? `"${arg.replaceAll(`"`, `""`)}"` : arg,
			)
			.join(" ");
	} else {
		return args
			.map((s) => {
				if (/["\s]/.test(s) && !/'/.test(s)) {
					return "'" + s.replace(/(['\\])/g, "\\$1") + "'";
				}
				if (/["'\s]/.test(s)) {
					return '"' + s.replace(/(["\\$`!])/g, "\\$1") + '"';
				}
				return s;
			})
			.join(" ");
	}
}
