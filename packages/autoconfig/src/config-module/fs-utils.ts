import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
	BunPackageManager,
	NpmPackageManager,
	PnpmPackageManager,
	YarnPackageManager,
} from "@cloudflare/workers-utils";
import type { PackageManager } from "@cloudflare/workers-utils";

/**
 * Path to the project's Wrangler JSON(C) config (`wrangler.jsonc` preferred,
 * then `wrangler.json`), or `undefined` if neither exists.
 */
export function getWranglerJsonConfigPath(dir: string): string | undefined {
	const jsonc = resolve(dir, "wrangler.jsonc");
	if (existsSync(jsonc)) {
		return jsonc;
	}
	const json = resolve(dir, "wrangler.json");
	if (existsSync(json)) {
		return json;
	}
	return undefined;
}

/** Whether the project declares a Vite config (`vite.config.{ts,js,…}`). */
export function hasViteConfig(projectPath: string): boolean {
	return ["ts", "js", "mjs", "mts", "cjs", "cts"].some((ext) =>
		existsSync(resolve(projectPath, `vite.config.${ext}`))
	);
}

/**
 * Detect the project's package manager from its lockfile, defaulting to npm.
 *
 * This is a lightweight, lockfile-only probe used by the standalone migration
 * flow. The lockfile names are taken from the shared `PackageManager`
 * definitions rather than duplicated here.
 */
export function detectPackageManager(
	projectPath: string
): PackageManager["type"] {
	for (const packageManager of [
		PnpmPackageManager,
		YarnPackageManager,
		BunPackageManager,
	]) {
		const hasLockFile = packageManager.lockFiles.some((lockFile) =>
			existsSync(resolve(projectPath, lockFile))
		);
		if (hasLockFile) {
			return packageManager.type;
		}
	}
	return NpmPackageManager.type;
}
