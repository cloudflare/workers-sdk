import { existsSync } from "node:fs";
import nodePath from "node:path";
import { brandColor, dim } from "@cloudflare/cli-shared-helpers/colors";
import { runCommand } from "@cloudflare/cli-shared-helpers/command";
import * as cliPackages from "@cloudflare/cli-shared-helpers/packages";
import semver from "semver";
import { fetch } from "undici";
import { writeFile } from "./files";
import { detectPackageManager } from "./packageManagers";
import type { C3Context } from "types";

const PNPM_BUILT_DEPENDENCIES = ["esbuild", "workerd", "sharp"];

/**
 * Writes a pnpm-workspace.yaml that allows build scripts for packages that
 * require them. pnpm 10+ blocks all build scripts by default, causing
 * ERR_PNPM_IGNORED_BUILDS during `pnpm install` without an explicit allow-list.
 */
export function writePnpmWorkspaceYaml(projectPath: string): void {
	const { name, version } = detectPackageManager();
	if (name !== "pnpm") {
		return;
	}

	const workspaceYamlPath = nodePath.join(projectPath, "pnpm-workspace.yaml");
	if (existsSync(workspaceYamlPath)) {
		return;
	}

	let content: string;
	if (semver.gte(version, "10.0.0")) {
		// pnpm 10+: allowBuilds uses a map of package -> boolean
		const entries = PNPM_BUILT_DEPENDENCIES.map((pkg) => `  ${pkg}: true`).join(
			"\n"
		);
		content = [
			"# Approve build scripts for packages that require them.",
			"# See: https://pnpm.io/settings#allowbuilds",
			"allowBuilds:",
			entries,
			"",
		].join("\n");
	} else if (semver.gte(version, "9.0.0")) {
		// pnpm 9.x: onlyBuiltDependencies is a list
		const entries = PNPM_BUILT_DEPENDENCIES.map((pkg) => `  - ${pkg}`).join(
			"\n"
		);
		content = [
			"# Approve build scripts for packages that require them.",
			"# See: https://pnpm.io/package_json#pnpmonlybuiltdependencies",
			"onlyBuiltDependencies:",
			entries,
			"",
		].join("\n");
	} else {
		return;
	}

	writeFile(workspaceYamlPath, content);
}

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

	writePnpmWorkspaceYaml(ctx.project.path);

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
