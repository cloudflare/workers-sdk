import { existsSync } from "node:fs";
import { join } from "node:path";
import { env } from "node:process";
import { UserError } from "@cloudflare/workers-utils";
import { execaCommandSync } from "execa";
import { logger } from "./logger";

export interface PackageManager {
	type: "npm" | "yarn" | "pnpm";
	npx: string;
}

export async function getPackageManager(
	cwd: string = process.cwd()
): Promise<PackageManager> {
	const [hasYarn, hasNpm, hasPnpm] = await Promise.all([
		supportsYarn(),
		supportsNpm(),
		supportsPnpm(),
	]);
	const hasYarnLock = existsSync(join(cwd, "yarn.lock"));
	const hasNpmLock = existsSync(join(cwd, "package-lock.json"));
	const hasPnpmLock = existsSync(join(cwd, "pnpm-lock.yaml"));
	const userAgent = sniffUserAgent();

	// check for lockfiles
	if (hasNpmLock) {
		if (hasNpm) {
			logger.debug(
				"Using npm as package manager, as there is already a package-lock.json file."
			);
			return { ...NpmPackageManager };
		} else if (hasYarn) {
			logger.debug("Using yarn as package manager.");
			logger.warn(
				"There is already a package-lock.json file but could not find npm on the PATH."
			);
			return { ...YarnPackageManager };
		}
	} else if (hasPnpmLock) {
		if (hasPnpm) {
			logger.debug(
				"Using pnpm as package manager, as there is already a pnpm-lock.yaml file."
			);
			return { ...PnpmPackageManager };
		} else {
			logger.warn(
				"There is already a pnpm-lock.yaml file but could not find pnpm on the PATH."
			);
			// will simply fallback to the first found of [npm, yaml, pnpm] in the next if round.
		}
	} else if (hasYarnLock) {
		if (hasYarn) {
			logger.debug(
				"Using yarn as package manager, as there is already a yarn.lock file."
			);
			return { ...YarnPackageManager };
		} else if (hasNpm) {
			logger.debug("Using npm as package manager.");
			logger.warn(
				"There is already a yarn.lock file but could not find yarn on the PATH."
			);
			return { ...NpmPackageManager };
		}
	}

	// check the user agent
	if (userAgent === "npm" && hasNpm) {
		logger.debug("Using npm as package manager.");
		return { ...NpmPackageManager };
	} else if (userAgent === "pnpm" && hasPnpm) {
		logger.debug("Using pnpm as package manager.");
		return { ...PnpmPackageManager };
	} else if (userAgent === "yarn" && hasYarn) {
		logger.debug("Using yarn as package manager.");
		return { ...YarnPackageManager };
	}

	// lastly, check what's installed
	if (hasNpm) {
		logger.debug("Using npm as package manager.");
		return { ...NpmPackageManager };
	} else if (hasYarn) {
		logger.debug("Using yarn as package manager.");
		return { ...YarnPackageManager };
	} else if (hasPnpm) {
		logger.debug("Using pnpm as package manager.");
		return { ...PnpmPackageManager };
	} else {
		throw new UserError(
			"Unable to find a package manager. Supported managers are: npm, yarn, and pnpm."
		);
	}
}

/**
 * Get the name of the given `packageManager`.
 */
export function getPackageManagerName(packageManager: PackageManager): string {
	return packageManager.type ?? "unknown";
}

/**
 * Manage packages using npm
 */
const NpmPackageManager: PackageManager = {
	type: "npm",
	npx: "npx",
};

/**
 * Manage packages using pnpm
 */
const PnpmPackageManager: PackageManager = {
	type: "pnpm",
	npx: "pnpm",
};

/**
 * Manage packages using yarn
 */
const YarnPackageManager: PackageManager = {
	type: "yarn",
	npx: "yarn",
};

async function supports(name: string): Promise<boolean> {
	try {
		execaCommandSync(`${name} --version`, { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

function supportsYarn(): Promise<boolean> {
	return supports("yarn");
}

function supportsNpm(): Promise<boolean> {
	return supports("npm");
}

function supportsPnpm(): Promise<boolean> {
	return supports("pnpm");
}

/**
 * The environment variable `npm_config_user_agent` can be used to
 * guess the package manager that was used to execute wrangler.
 * It's imperfect (just like regular user agent sniffing!)
 * but the package managers we support all set this property:
 *
 * - [npm](https://github.com/npm/cli/blob/1415b4bdeeaabb6e0ba12b6b1b0cc56502bd64ab/lib/utils/config/definitions.js#L1945-L1979)
 * - [pnpm](https://github.com/pnpm/pnpm/blob/cd4f9341e966eb8b411462b48ff0c0612e0a51a7/packages/plugin-commands-script-runners/src/makeEnv.ts#L14)
 * - [yarn](https://yarnpkg.com/advanced/lifecycle-scripts#environment-variables)
 */
export function sniffUserAgent(): "npm" | "pnpm" | "yarn" | undefined {
	const userAgent = env.npm_config_user_agent;
	if (userAgent === undefined) {
		return undefined;
	}

	if (userAgent.includes("yarn")) {
		return "yarn";
	}

	if (userAgent.includes("pnpm")) {
		return "pnpm";
	}

	if (userAgent.includes("npm")) {
		return "npm";
	}
}
