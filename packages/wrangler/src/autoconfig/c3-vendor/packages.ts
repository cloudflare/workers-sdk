import assert from "node:assert";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { parsePackageJSON, readFileSync } from "@cloudflare/workers-utils";
import { runCommand } from "./command";
import type { PackageManager } from "../../package-manager";

type InstallConfig = {
	startText?: string;
	doneText?: string;
	dev?: boolean;
	force?: boolean;
};

/**
 * Install a list of packages to the local project directory and add it to `package.json`
 *
 * @param packageManager - The package manager to use for installation
 * @param packages - An array of package specifiers to be installed
 * @param config.dev - Add packages as `devDependencies`
 * @param config.startText - Spinner start text
 * @param config.doneText - Spinner done text
 * @param config.force - Whether to install with `--force` or not
 */
export const installPackages = async (
	packageManager: PackageManager,
	packages: string[],
	config: InstallConfig = {}
) => {
	const { type } = packageManager;
	const { force, dev, startText, doneText } = config;

	if (packages.length === 0) {
		let cmd;
		switch (type) {
			case "yarn":
				break;
			case "npm":
			case "pnpm":
			default:
				cmd = "install";
				break;
		}

		await runCommand(
			[
				type,
				...(cmd ? [cmd] : []),
				...packages,
				...(type === "pnpm" ? ["--no-frozen-lockfile"] : []),
				...(force === true ? ["--force"] : []),
			],
			{
				startText,
				doneText,
				silent: true,
			}
		);
		return;
	}

	let saveFlag;
	let cmd;
	switch (type) {
		case "yarn":
			cmd = "add";
			saveFlag = dev ? "-D" : "";
			break;
		case "npm":
		case "pnpm":
		default:
			cmd = "install";
			saveFlag = dev ? "--save-dev" : "";
			break;
	}

	await runCommand(
		[
			type,
			cmd,
			...(saveFlag ? [saveFlag] : []),
			...packages,
			...(force === true ? ["--force"] : []),
		],
		{
			startText,
			doneText,
			silent: true,
		}
	);

	if (type === "npm") {
		// Npm install will update the package.json with a caret-range rather than the exact version/range we asked for.
		// We can't use `npm install --save-exact` because that always pins to an exact version, and we want to allow ranges too.
		// So let's just fix that up now by rewriting the package.json.
		const pkgJsonPath = path.join(process.cwd(), "package.json");
		const pkgJson = parsePackageJSON(readFileSync(pkgJsonPath), pkgJsonPath);
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
		await writeFile(pkgJsonPath, JSON.stringify(pkgJson, null, 2));
	}
};

/**
 *  Installs the latest version of wrangler in the project directory if it isn't already.
 */
export const installWrangler = async (packageManager: PackageManager) => {
	const { type } = packageManager;

	// Even if Wrangler is already installed, make sure we install the latest version, as some framework CLIs are pinned to an older version
	await installPackages(packageManager, [`wrangler@latest`], {
		dev: true,
		startText: `Installing wrangler ${dim(
			"A command line tool for building Cloudflare Workers"
		)}`,
		doneText: `${brandColor("installed")} ${dim(
			`via \`${type} install wrangler --save-dev\``
		)}`,
	});
};
