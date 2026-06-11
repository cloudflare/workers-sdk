import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
	getCloudflareApiEnvironmentFromEnv,
	getGlobalWranglerConfigPath,
	parseTOML,
	readFileSync,
} from "@cloudflare/workers-utils";
import TOML from "smol-toml";
import type {
	AuthConfigStorage,
	UserAuthConfig,
} from "@cloudflare/workers-auth";

/**
 * Wrangler's default `AuthConfigStorage`: a TOML file on disk, located under
 * the global Wrangler config directory.
 *
 * Injected into `@cloudflare/workers-auth` (the OAuth flow, `getAPIToken`, and
 * `readStoredAuthState`), which no longer ships a default of its own.
 */
export function defaultAuthConfigStorage(): AuthConfigStorage {
	return {
		read: readAuthConfigFile,
		write: writeAuthConfigFile,
		clear: () => rmSync(getAuthConfigFilePath()),
		path: getAuthConfigFilePath,
	};
}

/**
 * The path to the config file that holds user authentication data,
 * relative to the user's home directory.
 */
const USER_AUTH_CONFIG_PATH = "config";

/**
 * Returns the absolute path to the auth config TOML file.
 *
 * The file lives under the global Wrangler config directory and is named
 * `default.toml` in production, or `<environment>.toml` for the staging /
 * other Cloudflare API environments.
 */
export function getAuthConfigFilePath(): string {
	const environment = getCloudflareApiEnvironmentFromEnv();
	const filePath = `${USER_AUTH_CONFIG_PATH}/${environment === "production" ? "default.toml" : `${environment}.toml`}`;
	return path.join(getGlobalWranglerConfigPath(), filePath);
}

/**
 * Writes the user auth config to disk.
 *
 * No in-memory cache to invalidate — auth state is read on demand by every call
 * site that needs it. Callers are responsible for any consumer-side cache
 * purging (e.g. via the `OAuthFlowContext.purgeOnLoginOrLogout` hook).
 */
export function writeAuthConfigFile(config: UserAuthConfig): void {
	const configPath = getAuthConfigFilePath();

	mkdirSync(path.dirname(configPath), {
		recursive: true,
	});
	// Write with mode 0o600 on creation and re-`chmod` on every save so
	// other local users on shared hosts can't read the OAuth tokens.
	// `writeFileSync`'s `mode` option only applies when the file is
	// being created — the explicit `chmodSync` ensures that pre-existing
	// files (e.g. written by an older Wrangler version with the process
	// umask) get tightened on the next save too.
	writeFileSync(configPath, TOML.stringify(config), {
		encoding: "utf-8",
		mode: 0o600,
	});
	chmodSync(configPath, 0o600);
}

/**
 * Reads the user auth config from disk.
 *
 * @throws if the file does not exist or cannot be parsed as TOML. Callers
 * typically catch this and treat the failure as "not logged in via local OAuth".
 */
export function readAuthConfigFile(): UserAuthConfig {
	return parseTOML(readFileSync(getAuthConfigFilePath())) as UserAuthConfig;
}
