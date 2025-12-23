import assert from "node:assert";
import { existsSync } from "node:fs";
import nodePath from "node:path";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { fetch } from "undici";
import { runCommand } from "./command";
import { readJSON, writeJSON } from "./files";
import { detectPackageManager } from "./packageManagers";
import type { C3Context, PackageJson } from "types";

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
	if (packages.length === 0) {
		return;
	}

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

	if (npm === "npm") {
		// Npm install will update the package.json with a caret-range rather than the exact version/range we asked for.
		// We can't use `npm install --save-exact` because that always pins to an exact version, and we want to allow ranges too.
		// So let's just fix that up now by rewriting the package.json.
		const pkgJsonPath = nodePath.join(process.cwd(), "package.json");
		const pkgJson = readJSON(pkgJsonPath) as PackageJson;
		const deps = config.dev ? pkgJson.devDependencies : pkgJson.dependencies;
		assert(deps, "dependencies should be defined");
		for (const pkg of packages) {
			const versionMarker = pkg.lastIndexOf("@");
			if (versionMarker > 0) {
				// (if versionMarker was 0 then this would indicate a scoped package with no version)
				const pkgName = pkg.slice(0, versionMarker);
				const pkgVersion = pkg.slice(versionMarker + 1);
				if (pkgVersion !== "latest") {
					deps[pkgName] = pkgVersion;
				}
			}
		}
		writeJSON(pkgJsonPath, pkgJson);
	}
};

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
