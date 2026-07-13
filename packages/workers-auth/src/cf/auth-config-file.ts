import { createAuthConfigFileHelpers } from "../core/auth-config-file";
import { createFileStorage } from "../core/file-storage";
import { getCfConfigPath } from "./paths";
import type { ConfigStorage } from "../config-file";

/**
 * A JSON-file-on-disk storage backend (cf's on-disk format), a thin
 * `JSON`-bound wrapper over the CLI-agnostic {@link createFileStorage}.
 */
export function createJsonFileStorage<T extends object>(
	getPath: () => string
): ConfigStorage<T> {
	return createFileStorage<T>("json", getPath);
}

// cf's auth-config-file helpers: JSON files under cf's global config directory.
export const {
	getAuthConfigFilePath,
	getEncryptedAuthConfigFilePath,
	defaultAuthConfigStorage,
	readAuthConfigFile,
	writeAuthConfigFile,
} = createAuthConfigFileHelpers({
	getConfigPath: getCfConfigPath,
	format: "json",
});
