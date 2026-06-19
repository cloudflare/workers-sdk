import { existsSync } from "node:fs";
import { resolve } from "node:path";

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
