import { env } from "node:process";
import { UserError } from "@cloudflare/workers-utils";
import { execaCommandSync } from "execa";
import { logger } from "./logger";

export interface PackageManager {
	type: "npm" | "yarn" | "pnpm" | "bun";
	npx: string;
	dlx: string[];
	lockFiles: string[];
}

export async function getPackageManager(): Promise<PackageManager> {
	const [hasYarn, hasNpm, hasPnpm, hasBun] = await Promise.all([
		supportsYarn(),
		supportsNpm(),
		supportsPnpm(),
		supportsBun(),
	]);

	const userAgent = sniffUserAgent();

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
	} else if (userAgent === "bun" && hasBun) {
		logger.debug("Using bun as package manager.");
		return { ...BunPackageManager };
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
	} else if (hasBun) {
		logger.debug("Using bun as package manager.");
		return { ...BunPackageManager };
	} else {
		throw new UserError(
			"Unable to find a package manager. Supported managers are: npm, yarn, pnpm, and bun.",
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
export const NpmPackageManager = {
	type: "npm",
	npx: "npx",
	dlx: ["npx"],
	lockFiles: ["package-lock.json"],
} as const satisfies PackageManager;

/**
 * Manage packages using pnpm
 */
export const PnpmPackageManager = {
	type: "pnpm",
	npx: "pnpm",
	lockFiles: ["pnpm-lock.yaml"],
	dlx: ["pnpm", "dlx"],
} as const satisfies PackageManager;

/**
 * Manage packages using yarn
 */
export const YarnPackageManager = {
	type: "yarn",
	npx: "yarn",
	dlx: ["yarn", "dlx"],
	lockFiles: ["yarn.lock"],
} as const satisfies PackageManager;

/**
 * Manage packages using bun
 */
export const BunPackageManager = {
	type: "bun",
	npx: "bunx",
	dlx: ["bunx"],
	lockFiles: ["bun.lockb", "bun.lock"],
} as const satisfies PackageManager;

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

function supportsBun(): Promise<boolean> {
	return supports("bun");
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
 * - [bun](https://github.com/oven-sh/bun/blob/550522e99b303d8172b7b16c5750d458cb056434/src/Global.zig#L205)
 */
export function sniffUserAgent(): "npm" | "pnpm" | "yarn" | "bun" | undefined {
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

	if (userAgent.includes("bun")) {
		return "bun";
	}

	// npm should come last as it is included in the user agent strings of other package managers
	if (userAgent.includes("npm")) {
		return "npm";
	}
}
