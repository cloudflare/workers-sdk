import path from "node:path";
import type { Config } from "@cloudflare/workers-utils";

/**
 * Get a path to where we shall store persisted state in local dev.
 *
 * We use the `userConfigPath` rather than the potentially redirected `configPath`
 * to decide the path to this directory.
 */
export function getLocalPersistencePath(
	persistTo: string | undefined,
	{ userConfigPath }: Config
) {
	return persistTo
		? // If path specified, always treat it as relative to cwd()
			path.resolve(process.cwd(), persistTo)
		: // Otherwise, treat it as relative to the Wrangler configuration file,
			// if one can be found, otherwise cwd()
			path.resolve(
				userConfigPath ? path.dirname(userConfigPath) : process.cwd(),
				".wrangler/state"
			);
}
