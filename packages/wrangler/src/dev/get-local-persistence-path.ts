import path from "node:path";
import type { Config } from "@cloudflare/workers-utils";

/**
 * Get a path to where we shall store persisted state in local dev.
 *
 * We use the `userConfigPath` rather than the potentially redirected `configPath`
 * to decide the path to this directory.
 *
 * @param persistTo - The path to persist to, or `false` to disable persistence, or `undefined` to use the default path.
 *
 * @returns The path to persist to, or `false` if persistence is disabled.
 */
export function getLocalPersistencePath(
	persistTo: false,
	config: Config
): false;

export function getLocalPersistencePath(
	persistTo: string | undefined,
	config: Config
): string;

export function getLocalPersistencePath(
	persistTo: string | false | undefined,
	config: Config
): string | false;

export function getLocalPersistencePath(
	persistTo: string | false | undefined,
	{ userConfigPath }: Config
): string | false {
	if (persistTo === false) {
		return false;
	}

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
