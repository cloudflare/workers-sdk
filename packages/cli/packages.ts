import assert from "node:assert";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { parsePackageJSON, readFileSync } from "@cloudflare/workers-utils";
import { brandColor, dim } from "./colors";
import { runCommand } from "./command";

type InstallConfig = {
	startText?: string;
	doneText?: string;
	dev?: boolean;
	force?: boolean;
	isWorkspaceRoot?: boolean;
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
	packageManager: "npm" | "pnpm" | "yarn" | "bun",
	packages: string[],
	config: InstallConfig = {}
) => {
	const { force, dev, startText, doneText } = config;
	const isWorkspaceRoot = config.isWorkspaceRoot ?? false;

	if (packages.length === 0) {
		let cmd;
		switch (packageManager) {
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
				packageManager,
				...(cmd ? [cmd] : []),
				...packages,
				...(packageManager === "pnpm" ? ["--no-frozen-lockfile"] : []),
				...(force === true ? ["--force"] : []),
				...getWorkspaceInstallRootFlag(packageManager, isWorkspaceRoot),
			],
			{
				cwd: process.cwd(),
				startText,
				doneText,
				silent: true,
			}
		);
		return;
	}

	let saveFlag;
	let cmd;
	switch (packageManager) {
		case "yarn":
			cmd = "add";
			saveFlag = dev ? "-D" : "";
			break;
		case "bun":
			cmd = "add";
			saveFlag = dev ? "-d" : "";
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
			packageManager,
			cmd,
			...(saveFlag ? [saveFlag] : []),
			...packages,
			...(force === true ? ["--force"] : []),
			...getWorkspaceInstallRootFlag(packageManager, isWorkspaceRoot),
		],
		{
			startText,
			doneText,
			silent: true,
		}
	);

	if (packageManager === "npm") {
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
 * Returns the potential flag(/s) that need to be added to a package manager's install command when it is
 * run at the root of a workspace.
 *
 * @param packageManager The type of package manager
 * @param isWorkspaceRoot Flag indicating whether the install command is being run at the root of a workspace
 * @returns an array containing the flag(/s) to use, or an empty array if not supported or not running in the workspace root.
 */
function getWorkspaceInstallRootFlag(
	packageManager: "npm" | "pnpm" | "yarn" | "bun",
	isWorkspaceRoot: boolean
): string[] {
	if (!isWorkspaceRoot) {
		return [];
	}

	switch (packageManager) {
		case "pnpm":
			return ["--workspace-root"];
		case "yarn":
			return ["-W"];
		case "npm":
		case "bun":
			// npm and bun don't have the workspace check
			return [];
	}
}

/**
 *  Installs the latest version of wrangler in the project directory if it isn't already.
 */
export async function installWrangler(
	packageManager: "npm" | "pnpm" | "yarn" | "bun",
	isWorkspaceRoot: boolean
) {
	// Even if Wrangler is already installed, make sure we install the latest version, as some framework CLIs are pinned to an older version
	await installPackages(packageManager, [`wrangler@latest`], {
		dev: true,
		isWorkspaceRoot,
		startText: `Installing wrangler ${dim(
			"A command line tool for building Cloudflare Workers"
		)}`,
		doneText: `${brandColor("installed")} ${dim(
			`via \`${packageManager} install wrangler --save-dev\``
		)}`,
	});
}
