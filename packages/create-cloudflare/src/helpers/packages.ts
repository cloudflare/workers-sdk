import { existsSync } from "fs";
import path from "path";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { fetch } from "undici";
import { runCommand } from "./command";
import { detectPackageManager } from "./packageManagers";
import type { C3Context } from "types";

type InstallConfig = {
	startText?: string;
	doneText?: string;
	dev?: boolean;
};

/**
 * Install a list of packages to the local project directory and add it to `package.json`
 *
 * @param packages - An array of package specifiers to be installed
 * @param config.dev - Add packages as `devDependencies`
 * @param config.startText - Spinner start text
 * @param config.doneText - Spinner done text
 */
export const installPackages = async (
	packages: string[],
	config: InstallConfig = {},
) => {
	const { npm } = detectPackageManager();

	let saveFlag;
	let cmd;
	switch (npm) {
		case "yarn":
			cmd = "add";
			saveFlag = config.dev ? "-D" : "";
			break;
		case "bun":
			cmd = "add";
			saveFlag = config.dev ? "-d" : "";
			break;
		case "npm":
		case "pnpm":
		default:
			cmd = "install";
			saveFlag = config.dev ? "--save-dev" : "";
			break;
	}

	await runCommand([npm, cmd, ...(saveFlag ? [saveFlag] : []), ...packages], {
		...config,
		silent: true,
	});
};

/**
 * Install dependencies in the project directory via `npm install` or its equivalent.
 */
export const npmInstall = async (ctx: C3Context) => {
	// Skip this step if packages have already been installed
	const nodeModulesPath = path.join(ctx.project.path, "node_modules");
	if (existsSync(nodeModulesPath)) {
		return;
	}

	const { npm } = detectPackageManager();

	await runCommand([npm, "install"], {
		silent: true,
		startText: "Installing dependencies",
		doneText: `${brandColor("installed")} ${dim(`via \`${npm} install\``)}`,
	});
};

type NpmInfoResponse = {
	"dist-tags": { latest: string };
};

/**
 * Get the latest version of an npm package by making a request to the npm REST API.
 */
export async function getLatestPackageVersion(packageSpecifier: string) {
	const resp = await fetch(`https://registry.npmjs.org/${packageSpecifier}`);
	const npmInfo = (await resp.json()) as NpmInfoResponse;
	return npmInfo["dist-tags"].latest;
}

/**
 *  Installs the latest version of wrangler in the project directory if it isn't already.
 */
export const installWrangler = async () => {
	const { npm } = detectPackageManager();

	// Even if Wrangler is already installed, make sure we install the latest version, as some framework CLIs are pinned to an older version
	await installPackages([`wrangler@latest`], {
		dev: true,
		startText: `Installing wrangler ${dim(
			"A command line tool for building Cloudflare Workers",
		)}`,
		doneText: `${brandColor("installed")} ${dim(
			`via \`${npm} install wrangler --save-dev\``,
		)}`,
	});
};
