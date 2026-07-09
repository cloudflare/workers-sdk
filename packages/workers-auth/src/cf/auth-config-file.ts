import { JSON_FILE_FORMAT } from "../file-format";
import { createAuthConfigFileHelpers } from "../product/auth-config-file";
import { createFileStorage } from "../product/file-storage";
import { getCfConfigPath } from "./paths";
import type { ConfigStorage } from "../config-file";

/**
 * A JSON-file-on-disk storage backend (cf's on-disk format), a thin
 * `JSON`-bound wrapper over the product-agnostic {@link createFileStorage}.
 */
export function createJsonFileStorage<T extends object>(
	getPath: () => string
): ConfigStorage<T> {
	return createFileStorage<T>(JSON_FILE_FORMAT, getPath);
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
	format: JSON_FILE_FORMAT,
});
