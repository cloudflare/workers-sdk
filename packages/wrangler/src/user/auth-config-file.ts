import {
	chmodSync,
	existsSync,
	mkdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
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
	ConfigStorage,
	UserAuthConfig,
} from "@cloudflare/workers-auth";

/**
 * A TOML-file-on-disk storage backend, parameterised by the path it reads and
 * writes. Shared by the OAuth auth-config store ({@link defaultAuthConfigStorage})
 * and the temporary-preview-account store (`defaultTemporaryAccountStorage`) so
 * both get identical owner-only permission handling.
 *
 * `read()` throws when the file is missing or cannot be parsed — callers treat a
 * throw as "nothing stored". Files are written with mode `0o600` on creation and
 * re-`chmod`'d on every save (the `mode` option only applies on creation) so
 * other local users on shared hosts can't read the stored credentials.
 */
export function createTomlFileStorage<T extends object>(
	getPath: () => string
): ConfigStorage<T> {
	return {
		read: () => parseTOML(readFileSync(getPath())) as T,
		write(config) {
			const configPath = getPath();
			mkdirSync(path.dirname(configPath), { recursive: true });
			writeFileSync(configPath, TOML.stringify(config), {
				encoding: "utf-8",
				mode: 0o600,
			});
			chmodSync(configPath, 0o600);
		},
		clear() {
			const configPath = getPath();
			const existed = existsSync(configPath);
			rmSync(configPath, { force: true });
			return existed;
		},
		path: getPath,
	};
}

/**
 * Wrangler's default `AuthConfigStorage`: a TOML file on disk, located under
 * the global Wrangler config directory.
 *
 * Injected into `@cloudflare/workers-auth` (the OAuth flow, `getAPIToken`, and
 * `readStoredAuthState`), which no longer ships a default of its own.
 */
export function defaultAuthConfigStorage(): AuthConfigStorage {
	return createTomlFileStorage<UserAuthConfig>(getAuthConfigFilePath);
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
	createTomlFileStorage<UserAuthConfig>(getAuthConfigFilePath).write(config);
}

/**
 * Reads the user auth config from disk.
 *
 * @throws if the file does not exist or cannot be parsed as TOML. Callers
 * typically catch this and treat the failure as "not logged in via local OAuth".
 */
export function readAuthConfigFile(): UserAuthConfig {
	return createTomlFileStorage<UserAuthConfig>(getAuthConfigFilePath).read();
}
