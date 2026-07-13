import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import {
	getAuthConfigFilePath,
	getEncryptedAuthConfigFilePath,
	scrubEncryptedCredentials,
} from "../credential-store";
import { createProfileStore } from "../profiles";
import { createFileStorage } from "./file-storage";
import type { UserAuthConfig } from "../config-file/auth";
import type { OAuthFlowContext } from "../context";
import type {
	DirectoryBindingsStorage,
	ProfileConfigOperations,
	ProfileStore,
} from "../profiles";
import type { FileFormat } from "./file-format";

const DIRECTORY_BINDINGS_FILE = "profiles/directory-bindings.json";
const ENCRYPTED_PROFILE_CONFIG_EXTENSION = ".enc";

/** Consumer primitives {@link createCloudflareProfileStore} needs. */
export interface CloudflareProfileStoreContext {
	logger: OAuthFlowContext["logger"];
	/** The CLI's global config directory, resolved lazily. */
	getConfigPath: () => string;
	/** OS-keyring service identifier (for scrubbing encrypted profiles on delete). */
	keyringServiceName: string;
	/** On-disk format of the plaintext profile files (`.toml` / `.json`). */
	format: FileFormat;
}

/**
 * Build a {@link ProfileStore}: the profile config operations (backed by the
 * plaintext (`.toml`/`.json`) / `.enc` files under the global config dir) plus
 * the directory→profile bindings storage. Product-agnostic — parameterised by
 * the config path, keyring service name, and file format.
 */
export function createCloudflareProfileStore(
	ctx: CloudflareProfileStoreContext
): ProfileStore {
	const { logger, getConfigPath, keyringServiceName, format } = ctx;
	const plaintextExtension = `.${format}`;

	function plaintextPath(profile?: string): string {
		return getAuthConfigFilePath(getConfigPath(), profile, format);
	}

	function encryptedPath(profile?: string): string {
		return getEncryptedAuthConfigFilePath(getConfigPath(), profile);
	}

	function getProfileConfigDirectory(): string {
		return path.dirname(plaintextPath("default"));
	}

	const configs: ProfileConfigOperations = {
		exists(profile) {
			// A profile's credentials may be stored as a plaintext file or, when
			// keyring storage is enabled, as a keyring-encrypted `.enc` file.
			// Either presence means the profile exists.
			return (
				existsSync(plaintextPath(profile)) || existsSync(encryptedPath(profile))
			);
		},
		list() {
			const profilesDir = getProfileConfigDirectory();
			if (!existsSync(profilesDir)) {
				return [];
			}

			// Collect profile names from both plaintext and keyring-encrypted
			// (`.enc`) files, deduped — a profile can briefly have both during
			// the plaintext→encrypted migration.
			const names = new Set<string>();
			for (const file of readdirSync(profilesDir)) {
				if (file.endsWith(plaintextExtension)) {
					names.add(file.slice(0, -plaintextExtension.length));
				} else if (file.endsWith(ENCRYPTED_PROFILE_CONFIG_EXTENSION)) {
					names.add(file.slice(0, -ENCRYPTED_PROFILE_CONFIG_EXTENSION.length));
				}
			}
			return [...names];
		},
		delete(profile) {
			// Clear the encrypted backend (`.enc` file + keyring entry) first.
			// This is independent of the current keyring preference: the profile
			// may have been encrypted in an earlier session even if keyring
			// storage is now disabled, so we must not rely on the resolver
			// picking the encrypted store.
			const { backendAvailable, encryptedFileExisted } =
				scrubEncryptedCredentials({
					serviceName: keyringServiceName,
					configPath: getConfigPath(),
					profile,
					format,
				});
			// Also clear any plaintext file: covers non-keyring profiles and the
			// case where the keyring backend was unreachable (so the scrub above
			// couldn't remove a lingering plaintext file).
			createFileStorage<UserAuthConfig>(format, () =>
				plaintextPath(profile)
			).clear();
			if (encryptedFileExisted && !backendAvailable) {
				logger.warn(
					`Removed the credential files for profile "${profile}", but the keyring backend was not reachable on this host so its keyring entry could not be cleared. Clear it manually if it persists.`
				);
			}
		},
	};

	function getDirectoryBindingsPath(): string {
		return path.join(getConfigPath(), DIRECTORY_BINDINGS_FILE);
	}

	const bindings: DirectoryBindingsStorage = {
		read() {
			try {
				const raw = readFileSync(getDirectoryBindingsPath(), "utf-8");
				return JSON.parse(raw) as Record<string, string>;
			} catch {
				return {};
			}
		},
		write(dirBindings) {
			const bindingsPath = getDirectoryBindingsPath();
			mkdirSync(path.dirname(bindingsPath), { recursive: true });
			writeFileSync(
				bindingsPath,
				JSON.stringify(dirBindings, null, "\t"),
				"utf-8"
			);
		},
	};

	return createProfileStore({ configs, bindings });
}
