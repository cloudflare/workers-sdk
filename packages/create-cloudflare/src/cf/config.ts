import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** The file that `cf workers types` writes a project's generated types to. */
export const CF_TYPES_PATH = "./.cloudflare/types/index.d.ts";

/**
 * Whether the project is configured by a `cloudflare.config.ts` file, and is
 * therefore managed with the `cf` CLI rather than Wrangler.
 *
 * @param projectPath The path to the project directory.
 * @returns `true` if the project uses the `cf` CLI.
 */
export function usesCfCli(projectPath: string): boolean {
	return existsSync(resolve(projectPath, "cloudflare.config.ts"));
}
