import {
	getAuthConfigFilePath as getAuthConfigFilePathForConfig,
	getEncryptedAuthConfigFilePath as getEncryptedAuthConfigFilePathForConfig,
} from "../credential-store";
import { createFileStorage } from "./file-storage";
import type { AuthConfigStorage, UserAuthConfig } from "../config-file/auth";
import type { FileFormat } from "../file-format";

/**
 * The per-product auth-config-file helpers: the profile → on-disk path layout
 * (plaintext `<profile>.<ext>` + its sibling `.enc`) plus the plaintext
 * profile-file storage primitives, bound to a product's global config directory
 * and {@link FileFormat}.
 *
 * The credential-store layer owns the layout but takes the config directory as
 * an argument (the CLI owns where its config lives); this binds it to a
 * specific product and exposes the ergonomic `(profile)` signature. The dir is
 * re-resolved on each call so tests re-stubbing `HOME` / `XDG_CONFIG_HOME`
 * point at the right place.
 */
export interface AuthConfigFileHelpers {
	getAuthConfigFilePath: (profile?: string) => string;
	getEncryptedAuthConfigFilePath: (profile?: string) => string;
	/**
	 * A plaintext `AuthConfigStorage` for a specific profile. Used by profile
	 * management (listing / deleting named profiles) and by tests that seed a
	 * profile's file directly. The production login / logout / refresh path does
	 * NOT use this — it goes through the keyring-aware `storageFactory`, which
	 * may persist credentials in an encrypted file instead.
	 */
	defaultAuthConfigStorage: (profile?: string) => AuthConfigStorage;
	/** Read a profile's plaintext auth config; `undefined` if missing/unparseable. */
	readAuthConfigFile: (profile?: string) => UserAuthConfig | undefined;
	/** Write a profile's plaintext auth config to disk. */
	writeAuthConfigFile: (config: UserAuthConfig, profile?: string) => void;
}

export function createAuthConfigFileHelpers(deps: {
	getConfigPath: () => string;
	format: FileFormat;
}): AuthConfigFileHelpers {
	const { getConfigPath, format } = deps;

	function getAuthConfigFilePath(profile?: string): string {
		return getAuthConfigFilePathForConfig(
			getConfigPath(),
			profile,
			format.extension
		);
	}

	function getEncryptedAuthConfigFilePath(profile?: string): string {
		return getEncryptedAuthConfigFilePathForConfig(getConfigPath(), profile);
	}

	function defaultAuthConfigStorage(profile?: string): AuthConfigStorage {
		return createFileStorage<UserAuthConfig>(format, () =>
			getAuthConfigFilePath(profile)
		);
	}

	function writeAuthConfigFile(config: UserAuthConfig, profile?: string): void {
		defaultAuthConfigStorage(profile).write(config);
	}

	function readAuthConfigFile(profile?: string): UserAuthConfig | undefined {
		return defaultAuthConfigStorage(profile).read();
	}

	return {
		getAuthConfigFilePath,
		getEncryptedAuthConfigFilePath,
		defaultAuthConfigStorage,
		readAuthConfigFile,
		writeAuthConfigFile,
	};
}
