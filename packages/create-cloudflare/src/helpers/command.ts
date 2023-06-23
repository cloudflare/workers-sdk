import { existsSync } from "fs";
import path from "path";
import { spawn } from "cross-spawn";
import { endSection, stripAnsi } from "./cli";
import { brandColor, dim } from "./colors";
import { spinner } from "./interactive";
import { detectPackageManager } from "./packages";
import type { PagesGeneratorContext } from "types";

/**
 * Command can be either:
 *    - a string, like `git commit -m "Changes"`
 *    - a string array, like ['git', 'commit', '-m', '"Initial commit"']
 *
 * The string version is a convenience but is unsafe if your args contain spaces
 */
type Command = string | string[];

type RunOptions = {
	startText?: string;
	doneText?: string | ((result: string) => string);
	silent?: boolean;
	captureOutput?: boolean;
	useSpinner?: boolean;
	env?: NodeJS.ProcessEnv;
	cwd?: string;
	transform?: (output: string) => string;
	fallback?: (error: unknown) => string;
};

type MultiRunOptions = RunOptions & {
	commands: Command[];
	startText: string;
};

type PrintOptions<T> = {
	promise: Promise<T> | (() => Promise<T>);
	useSpinner?: boolean;
	startText: string;
	doneText?: string | ((result: T) => string);
};

export const runCommand = async (
	command: Command,
	opts: RunOptions = {}
): Promise<string> => {
	if (typeof command === "string") {
		command = command.trim().replace(/\s+/g, ` `).split(" ");
	}

	return printAsyncStatus({
		useSpinner: opts.useSpinner ?? opts.silent,
		startText: opts.startText || command.join(" "),
		doneText: opts.doneText,
		promise() {
			const [executable, ...args] = command;

			const squelch = opts.silent || process.env.VITEST;

			const cmd = spawn(executable, [...args], {
				// TODO: ideally inherit stderr, but npm install uses this for warnings
				// stdio: [ioMode, ioMode, "inherit"],
				stdio: squelch ? "pipe" : "inherit",
				env: {
					...process.env,
					...opts.env,
				},
				cwd: opts.cwd,
			});

			let output = ``;

			if (opts?.captureOutput ?? squelch) {
				cmd.stdout?.on("data", (data) => {
					output += data;
				});
				cmd.stderr?.on("data", (data) => {
					output += data;
				});
			}

			return new Promise<string>((resolve, reject) => {
				cmd.on("close", (code) => {
					try {
						if (code !== 0) {
							throw new Error(output, { cause: code });
						}

						// Process any captured output
						const transform = opts.transform ?? ((result: string) => result);
						const processedOutput = transform(stripAnsi(output));

						// Send the captured (and processed) output back to the caller
						resolve(processedOutput);
					} catch (e) {
						// Something went wrong.
						// Perhaps the command or the transform failed.
						// If there is a fallback use the result of calling that
						if (opts.fallback) {
							resolve(opts.fallback(e));
						} else {
							reject(new Error(output, { cause: e }));
						}
					}
				});
			});
		},
	});
};

// run multiple commands in sequence (not parallel)
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

	if (opts.useSpinner) {
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

export const retry = async <T>(times: number, fn: () => Promise<T>) => {
	let error: unknown = null;
	while (times > 0) {
		try {
			return await fn();
		} catch (e) {
			error = e;
			times--;
		}
	}
	throw error;
};

// Prints the section header & footer while running the `cmd`
export const runFrameworkGenerator = async (
	ctx: PagesGeneratorContext,
	cmd: string
) => {
	endSection(
		`Continue with ${ctx.framework?.config.displayName}`,
		`via \`${cmd.trim()}\``
	);

	if (process.env.VITEST) {
		const flags = ctx.framework?.config.testFlags ?? [];
		cmd = `${cmd} ${flags.join(" ")}`;
	}

	await runCommand(cmd);
};

type InstallConfig = {
	startText?: string;
	doneText?: string;
	dev?: boolean;
};

export const installPackages = async (
	packages: string[],
	config: InstallConfig
) => {
	const { npm } = detectPackageManager();

	let saveFlag;
	let cmd;
	switch (npm) {
		case "yarn":
			cmd = "add";
			saveFlag = config.dev ? "-D" : "";
			break;
		case "npm":
		case "pnpm":
		default:
			cmd = "install";
			saveFlag = config.dev ? "--save-dev" : "--save";
			break;
	}

	await runCommand(`${npm} ${cmd} ${saveFlag} ${packages.join(" ")}`, {
		...config,
		silent: true,
	});
};

export const npmInstall = async () => {
	const { npm } = detectPackageManager();

	await runCommand(`${npm} install`, {
		silent: true,
		startText: "Installing dependencies",
		doneText: `${brandColor("installed")} ${dim(`via \`${npm} install\``)}`,
	});
};

export const installWrangler = async () => {
	const { npm } = detectPackageManager();

	// Exit early if already installed
	if (existsSync(path.resolve("node_modules", "wrangler"))) {
		return;
	}

	await installPackages([`wrangler`], {
		dev: true,
		startText: `Installing wrangler ${dim(
			"A command line tool for building Cloudflare Workers"
		)}`,
		doneText: `${brandColor("installed")} ${dim(
			`via \`${npm} install wrangler --save-dev\``
		)}`,
	});
};

export const isLoggedIn = async () => {
	const { npx } = detectPackageManager();
	const output = await runCommand(`${npx} wrangler whoami`, {
		silent: true,
	});

	return !/not authenticated/.test(output);
};

export const wranglerLogin = async () => {
	const { npx } = detectPackageManager();

	const s = spinner();
	s.start(`Logging into Cloudflare ${dim("checking authentication status")}`);
	const alreadyLoggedIn = await isLoggedIn();
	s.stop(brandColor(alreadyLoggedIn ? "logged in" : "not logged in"));
	if (alreadyLoggedIn) return true;

	s.start(`Logging into Cloudflare ${dim("This will open a browser window")}`);

	// We're using a custom spinner since this is a little complicated.
	// We want to vary the done status based on the output
	const output = await runCommand(`${npx} wrangler login`, {
		silent: true,
	});
	const success = /Successfully logged in/.test(output);

	const verb = success ? "allowed" : "denied";
	s.stop(`${brandColor(verb)} ${dim("via `wrangler login`")}`);

	return success;
};

export const listAccounts = async () => {
	const { npx } = detectPackageManager();

	const output = await runCommand(`${npx} wrangler whoami`, {
		silent: true,
	});

	const accounts: Record<string, string> = {};
	output.split("\n").forEach((line) => {
		const match = line.match(/│\s+(.+)\s+│\s+(\w{32})\s+│/);
		if (match) {
			accounts[match[1].trim()] = match[2].trim();
		}
	});

	return accounts;
};

/**
 * Look up the latest release of workerd and use its date as the compatibility_date
 * configuration value for wrangler.toml.
 *
 * If the look up fails then we fall back to a well known date.
 *
 * The date is extracted from the version number of the workerd package tagged as `latest`.
 * The format of the version is `major.yyyymmdd.patch`.
 *
 * @returns The latest compatibility date for workerd in the form "YYYY-MM-DD"
 */
export async function getWorkerdCompatibilityDate() {
	const { npm } = detectPackageManager();
	return runCommand(`${npm} info workerd dist-tags.latest`, {
		silent: true,
		captureOutput: true,
		startText: "Retrieving current workerd compatibility date",
		transform: (result) => {
			// The format of the workerd version is `major.yyyymmdd.patch`.
			const match = result.match(/\d+\.(\d{4})(\d{2})(\d{2})\.\d+/);
			if (!match) {
				throw new Error("Could not find workerd date");
			}
			const [, year, month, date] = match;
			return `${year}-${month}-${date}`;
		},
		fallback: () => "2023-05-18",
		doneText: (output) => `${brandColor("compatibility date")} ${dim(output)}`,
	});
}
