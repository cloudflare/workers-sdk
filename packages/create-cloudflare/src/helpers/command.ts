import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";
import whichPmRuns from "which-pm-runs";
import { endSection, logRaw, stripAnsi } from "./cli";
import { brandColor, dim } from "./colors";
import { spinner } from "./interactive";
import type { PagesGeneratorContext } from "types";

type RunOptions = {
	startText?: string;
	doneText?: string;
	silent?: boolean;
	captureOutput?: boolean;
	env?: NodeJS.ProcessEnv;
	cwd?: string;
};

export const runCommand = async (
	command: string,
	opts?: RunOptions
): Promise<string> => {
	const s = spinner();

	if (opts?.startText && !process.env.VITEST) {
		s.start(opts?.startText || command);
	}

	const [executable, ...args] = command.split(" ");

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

	if (opts?.silent) {
		cmd.stdout?.on("data", (data) => {
			output += data;
		});
		cmd.stderr?.on("data", (data) => {
			output += data;
		});
	}

	return await new Promise((resolve, reject) => {
		cmd.on("close", (code) => {
			if (code === 0) {
				if (opts?.doneText && !process.env.VITEST) {
					s.stop(opts?.doneText);
				}
				resolve(stripAnsi(output));
			} else {
				logRaw(output);
				reject(code);
			}
		});
	});
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

	const alreadyLoggedIn = await isLoggedIn();
	if (alreadyLoggedIn) return true;

	const s = spinner();
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
