import { readAuthConfig, writeAuthConfig } from "@cloudflare/workers-auth";
import { getAuthConfigFilePath } from "@cloudflare/workers-utils";
import type {
	ConfigFileLocation,
	UserAuthConfig,
} from "@cloudflare/workers-auth";

export { getAuthConfigFilePath };

/**
 * Wrangler's auth-config file location for a given profile: a TOML file under
 * the global config directory (`default.toml`, `<environment>.toml`, or
 * `<profile>.toml`). Shared (via the path helper) so delegated tools resolve
 * the same file, and so workers-auth owns the actual read/write.
 */
export function defaultAuthConfigLocation(
	profile?: string
): ConfigFileLocation {
	return { getPath: () => getAuthConfigFilePath(profile), format: "toml" };
}

/**
 * Writes the user auth config to disk.
 *
 * No in-memory cache to invalidate — auth state is read on demand by every call
 * site that needs it. Callers are responsible for any consumer-side cache
 * purging (e.g. via the `OAuthFlowContext.purgeOnLoginOrLogout` hook).
 */
export function writeAuthConfigFile(
	config: UserAuthConfig,
	profile?: string
): void {
	writeAuthConfig(defaultAuthConfigLocation(profile), config);
}

/**
 * Reads the user auth config from disk.
 *
 * @throws if the file does not exist or cannot be parsed as TOML. Callers
 * typically catch this and treat the failure as "not logged in via local OAuth".
 */
export function readAuthConfigFile(profile?: string): UserAuthConfig {
	return readAuthConfig(defaultAuthConfigLocation(profile));
}
