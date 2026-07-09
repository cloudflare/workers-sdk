import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { getGlobalConfigPath } from "@cloudflare/workers-utils";
import { scrubEncryptedCredentials } from "../credential-store";
import { createProfileStore } from "../profiles";
import {
	defaultAuthConfigStorage,
	getAuthConfigFilePath,
	getEncryptedAuthConfigFilePath,
} from "./auth-config-file";
import { WRANGLER_KEYRING_SERVICE_NAME } from "./constants";
import type { OAuthFlowContext } from "../context";
import type {
	DirectoryBindingsStorage,
	ProfileConfigOperations,
	ProfileStore,
} from "../profiles";

const DIRECTORY_BINDINGS_FILE = "profiles/directory-bindings.json";
const PROFILE_CONFIG_EXTENSION = ".toml";
const ENCRYPTED_PROFILE_CONFIG_EXTENSION = ".enc";

/** Consumer primitives {@link createWranglerProfileStore} needs. */
export interface WranglerProfileStoreContext {
	logger: OAuthFlowContext["logger"];
}

function getProfileConfigDirectory(): string {
	return path.dirname(getAuthConfigFilePath("default"));
}

function createWranglerProfileConfigOperations(
	logger: OAuthFlowContext["logger"]
): ProfileConfigOperations {
	return {
		exists(profile) {
			// A profile's credentials may be stored as a plaintext TOML file
			// or, when keyring storage is enabled, as a keyring-encrypted
			// `.enc` file. Either presence means the profile exists.
			return (
				existsSync(getAuthConfigFilePath(profile)) ||
				existsSync(getEncryptedAuthConfigFilePath(profile))
			);
		},
		list() {
			const profilesDir = getProfileConfigDirectory();
			if (!existsSync(profilesDir)) {
				return [];
			}

			// Collect profile names from both plaintext (`.toml`) and
			// keyring-encrypted (`.enc`) files, deduped — a profile can
			// briefly have both during the plaintext→encrypted migration.
			const names = new Set<string>();
			for (const file of readdirSync(profilesDir)) {
				if (file.endsWith(PROFILE_CONFIG_EXTENSION)) {
					names.add(file.slice(0, -PROFILE_CONFIG_EXTENSION.length));
				} else if (file.endsWith(ENCRYPTED_PROFILE_CONFIG_EXTENSION)) {
					names.add(file.slice(0, -ENCRYPTED_PROFILE_CONFIG_EXTENSION.length));
				}
			}
			return [...names];
		},
		delete(profile) {
			// Clear the encrypted backend (`.enc` file + keyring entry) first.
			// This is independent of the current keyring preference: the
			// profile may have been encrypted in an earlier session even if
			// keyring storage is now disabled, so we must not rely on the
			// resolver picking the encrypted store.
			const { backendAvailable, encryptedFileExisted } =
				scrubEncryptedCredentials({
					serviceName: WRANGLER_KEYRING_SERVICE_NAME,
					configPath: getGlobalConfigPath(),
					profile,
				});
			// Also clear any plaintext TOML: covers non-keyring profiles and
			// the case where the keyring backend was unreachable (so the scrub
			// above couldn't remove a lingering plaintext file).
			defaultAuthConfigStorage(profile).clear();
			if (encryptedFileExisted && !backendAvailable) {
				logger.warn(
					`Removed the credential files for profile "${profile}", but the keyring backend was not reachable on this host so its keyring entry could not be cleared. Clear it manually if it persists.`
				);
			}
		},
	};
}

function getDirectoryBindingsPath(): string {
	return path.join(getGlobalConfigPath(), DIRECTORY_BINDINGS_FILE);
}

function createWranglerDirectoryBindingsStorage(): DirectoryBindingsStorage {
	return {
		read() {
			try {
				const raw = readFileSync(getDirectoryBindingsPath(), "utf-8");
				return JSON.parse(raw) as Record<string, string>;
			} catch {
				return {};
			}
		},
		write(bindings) {
			const bindingsPath = getDirectoryBindingsPath();
			mkdirSync(path.dirname(bindingsPath), { recursive: true });
			writeFileSync(
				bindingsPath,
				JSON.stringify(bindings, null, "\t"),
				"utf-8"
			);
		},
	};
}

/**
 * Build wrangler's {@link ProfileStore}: the profile config operations (backed
 * by the `.toml` / `.enc` files under the global config dir) plus the
 * directory→profile bindings storage.
 */
export function createWranglerProfileStore(
	ctx: WranglerProfileStoreContext
): ProfileStore {
	return createProfileStore({
		configs: createWranglerProfileConfigOperations(ctx.logger),
		bindings: createWranglerDirectoryBindingsStorage(),
	});
}
