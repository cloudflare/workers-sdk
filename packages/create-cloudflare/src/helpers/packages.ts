import { existsSync } from "node:fs";
import nodePath from "node:path";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { runCommand } from "@cloudflare/cli/command";
import * as cliPackages from "@cloudflare/cli/packages";
import { fetch } from "undici";
import { detectPackageManager } from "./packageManagers";
import type { C3Context } from "types";

type InstallConfig = {
	startText?: string;
	doneText?: string;
	dev?: boolean;
	force?: boolean;
	isWorkspaceRoot?: boolean;
};

/**
 * Install a list of packages to the local project directory.
 * Automatically detects the package manager from the environment.
 */
export const installPackages = async (
	packages: string[],
	config: InstallConfig = {}
) => {
	const { npm } = detectPackageManager();
	return cliPackages.installPackages(npm, packages, config);
};

/**
 * Installs the latest version of wrangler in the project directory.
 * Automatically detects the package manager from the environment.
 */
export async function installWrangler() {
	const { npm } = detectPackageManager();
	return cliPackages.installWrangler(npm, false);
}

/**
 * Install dependencies in the project directory via `npm install` or its equivalent.
 */
export const npmInstall = async (ctx: C3Context) => {
	// Skip this step if packages have already been installed
	const nodeModulesPath = nodePath.join(ctx.project.path, "node_modules");
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
