import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { C3Context } from "types";

/** The file that `cf workers types` writes a project's generated types to. */
export const CF_TYPES_PATH = "./.cloudflare/types/index.d.ts";

/**
 * Whether the project is configured by a `cloudflare.config.ts` file, and is
 * therefore managed with the `cf` CLI rather than Wrangler.
 *
 * @param ctx The C3 context.
 * @returns `true` if the project uses the `cf` CLI.
 */
export function usesCfCli(ctx: C3Context): boolean {
	return existsSync(resolve(ctx.project.path, "cloudflare.config.ts"));
}
