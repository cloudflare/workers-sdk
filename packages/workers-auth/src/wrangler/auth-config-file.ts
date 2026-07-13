import { getGlobalConfigPath } from "@cloudflare/workers-utils";
import { createAuthConfigFileHelpers } from "../core/auth-config-file";
import { createFileStorage } from "../core/file-storage";
import type { ConfigStorage } from "../config-file";

/**
 * A TOML-file-on-disk storage backend, parameterised by the path it reads and
 * writes. Wrangler's historical file format is TOML, so this is a thin
 * `TOML`-bound wrapper over the CLI-agnostic {@link createFileStorage}.
 */
export function createTomlFileStorage<T extends object>(
	getPath: () => string
): ConfigStorage<T> {
	return createFileStorage<T>("toml", getPath);
}

// Wrangler's auth-config-file helpers: TOML files under wrangler's global
// config directory.
export const {
	getAuthConfigFilePath,
	getEncryptedAuthConfigFilePath,
	defaultAuthConfigStorage,
	readAuthConfigFile,
	writeAuthConfigFile,
} = createAuthConfigFileHelpers({
	getConfigPath: getGlobalConfigPath,
	format: "toml",
});
