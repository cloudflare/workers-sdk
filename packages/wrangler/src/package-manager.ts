import { env } from "node:process";
import { execaCommandSync } from "execa";
import { UserError } from "./errors";
import { logger } from "./logger";

export interface PackageManager {
	type: "npm" | "yarn" | "pnpm";
}

export async function getPackageManager(): Promise<PackageManager> {
	const [hasYarn, hasNpm, hasPnpm] = await Promise.all([
		supportsYarn(),
		supportsNpm(),
		supportsPnpm(),
	]);

	const userAgent = sniffUserAgent();

	// check the user agent
	if (userAgent === "npm" && hasNpm) {
		logger.log("Using npm as package manager.");
		return { ...NpmPackageManager };
	} else if (userAgent === "pnpm" && hasPnpm) {
		logger.log("Using pnpm as package manager.");
		return { ...PnpmPackageManager };
	} else if (userAgent === "yarn" && hasYarn) {
		logger.log("Using yarn as package manager.");
		return { ...YarnPackageManager };
	}

	// lastly, check what's installed
	if (hasNpm) {
		logger.log("Using npm as package manager.");
		return { ...NpmPackageManager };
	} else if (hasYarn) {
		logger.log("Using yarn as package manager.");
		return { ...YarnPackageManager };
	} else if (hasPnpm) {
		logger.log("Using pnpm as package manager.");
		return { ...PnpmPackageManager };
	} else {
		throw new UserError(
			"Unable to find a package manager. Supported managers are: npm, yarn, and pnpm.",
			{
				telemetryMessage: true,
			}
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
};

/**
 * Manage packages using pnpm
 */
const PnpmPackageManager: PackageManager = {
	type: "pnpm",
};

/**
 * Manage packages using yarn
 */
const YarnPackageManager: PackageManager = {
	type: "yarn",
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
