import { existsSync } from "fs";
import path from "path";
import { spawn } from "cross-spawn";
import whichPmRuns from "which-pm-runs";
import { endSection, stripAnsi } from "./cli";
import { brandColor, dim } from "./colors";
import { spinner } from "./interactive";
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
	doneText?: string;
	silent?: boolean;
	captureOutput?: boolean;
	useSpinner?: boolean;
	env?: NodeJS.ProcessEnv;
	cwd?: string;
};

type MultiRunOptions = RunOptions & {
	commands: Command[];
	startText: string;
};

type PrintOptions<T> = {
	promise: Promise<T> | (() => Promise<T>);
	useSpinner?: boolean;
	startText: string;
	doneText?: string;
};

export const runCommand = async (
	command: Command,
	opts?: RunOptions
): Promise<string> => {
	if (typeof command === "string") {
		command = command.trim().replace(/\s+/g, ` `).split(" ");
	}

	return printAsyncStatus({
		useSpinner: opts?.useSpinner ?? opts?.silent,
		startText: opts?.startText || command.join(" "),
		doneText: opts?.doneText,
		promise() {
			const [executable, ...args] = command;

			const squelch = opts?.silent || process.env.VITEST;

			const cmd = spawn(executable, [...args], {
				// TODO: ideally inherit stderr, but npm install uses this for warnings
				// stdio: [ioMode, ioMode, "inherit"],
				stdio: squelch ? "pipe" : "inherit",
				env: {
					...process.env,
					...opts?.env,
				},
				cwd: opts?.cwd,
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
					if (code === 0) {
						resolve(stripAnsi(output));
					} else {
						reject(new Error(output, { cause: code }));
					}
				});
			});
		},
	});
};

// run mutliple commands in sequence (not parallel)
export async function runCommands({ commands, ...opts }: MultiRunOptions) {
	return printAsyncStatus({
		useSpinner: opts.useSpinner ?? opts.silent,
		startText: opts.startText,
		doneText: opts.doneText,
		async promise() {
			for (const command of commands) {
				await runCommand(command, { ...opts, useSpinner: false });
			}
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
		await promise;

		s?.stop(opts.doneText);
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

export const detectPackageManager = () => {
	const pm = whichPmRuns();

	if (!pm) {
		return { npm: "npm", npx: "npx" };
	}

	return {
		npm: pm.name,
		npx: pm.name === "pnpm" ? `pnpx` : `npx`,
	};
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
