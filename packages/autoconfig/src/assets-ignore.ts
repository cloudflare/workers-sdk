import { PROJECT_ROOT_ASSETS_IGNORE_ENTRIES } from "@cloudflare/cli-shared-helpers/gitignore";
import {
	BunPackageManager,
	NpmPackageManager,
	NubPackageManager,
	PnpmPackageManager,
	YarnPackageManager,
} from "@cloudflare/workers-utils";
import type { PackageManager } from "@cloudflare/workers-utils";

const packageManagers = new Map<string, PackageManager>(
	[
		NpmPackageManager,
		PnpmPackageManager,
		YarnPackageManager,
		BunPackageManager,
		NubPackageManager,
	].map((manager) => [manager.type, manager])
);

/** Project-file patterns appended after the Wrangler rules during scaffolding. */
export function getScaffoldedProjectAssetsIgnoreEntries(
	lockFiles: readonly string[]
): string[] {
	return [
		...PROJECT_ROOT_ASSETS_IGNORE_ENTRIES,
		"/.cloudflare",
		"/.gitignore",
		"/cloudflare.config.ts",
		"/wrangler.config.ts",
		"/package.json",
		"/tsconfig.json",
		...lockFiles.map((lockFile) => `/${lockFile}`),
	];
}

/** The ordered rules written when scaffolding a new project-root `.assetsignore`. */
export function getScaffoldedAssetsIgnorePatterns(
	packageManager?: string
): string[] {
	const manager =
		packageManagers.get(packageManager ?? "") ?? NpmPackageManager;
	return [
		".wrangler",
		".dev.vars*",
		"!.dev.vars.example",
		".env*",
		"!.env.example",
		...getScaffoldedProjectAssetsIgnoreEntries(manager.lockFiles),
	];
}
