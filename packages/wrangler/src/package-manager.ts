import { env } from "node:process";
import { UserError } from "@cloudflare/workers-utils";
import { execaCommandSync } from "execa";
import { logger } from "./logger";

export type { PackageManager } from "@cloudflare/workers-utils";

export {
	NpmPackageManager,
	PnpmPackageManager,
	YarnPackageManager,
	BunPackageManager,
	NubPackageManager,
} from "@cloudflare/workers-utils";

import {
	NpmPackageManager,
	PnpmPackageManager,
	YarnPackageManager,
	BunPackageManager,
	NubPackageManager,
} from "@cloudflare/workers-utils";
import type { PackageManager } from "@cloudflare/workers-utils";

export async function getPackageManager(): Promise<PackageManager> {
	const [hasYarn, hasNpm, hasPnpm, hasBun, hasNub] = await Promise.all([
		supportsYarn(),
		supportsNpm(),
		supportsPnpm(),
		supportsBun(),
		supportsNub(),
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
	} else if (userAgent === "nub" && hasNub) {
		logger.debug("Using nub as package manager.");
		return { ...NubPackageManager };
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
	} else if (hasNub) {
		logger.debug("Using nub as package manager.");
		return { ...NubPackageManager };
	} else {
		throw new UserError(
			"Unable to find a package manager. Supported managers are: npm, yarn, pnpm, bun, and nub.",
			{
				telemetryMessage: "package manager detection missing manager",
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

function supportsNub(): Promise<boolean> {
	return supports("nub");
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
export function sniffUserAgent():
	| "npm"
	| "pnpm"
	| "yarn"
	| "bun"
	| "nub"
	| undefined {
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

	// nub's user agent contains "npm" (e.g. `nub/0.4.5 npm/? …`), so check it before npm.
	if (userAgent.includes("nub")) {
		return "nub";
	}

	// npm should come last as it is included in the user agent strings of other package managers
	if (userAgent.includes("npm")) {
		return "npm";
	}
}
