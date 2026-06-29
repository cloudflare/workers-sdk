import {
	chmodSync,
	existsSync,
	mkdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { getAuthConfigFilePath } from "@cloudflare/workers-auth";
import { parseTOML, readFileSync } from "@cloudflare/workers-utils";
import TOML from "smol-toml";
import type {
	AuthConfigStorage,
	ConfigStorage,
	UserAuthConfig,
} from "@cloudflare/workers-auth";

/**
 * A TOML-file-on-disk storage backend, parameterised by the path it reads and
 * writes. Used by the temporary-preview-account store
 * (`defaultTemporaryAccountStorage`) and the plaintext auth-profile primitives
 * (`defaultAuthConfigStorage` / `readAuthConfigFile` / `writeAuthConfigFile`).
 *
 * `read()` follows the `ConfigStorage<T>` contract: a missing file *or* a file
 * that exists but can't be parsed as `T` is the empty state and returns
 * `undefined`, so a corrupt store is treated as "nothing usable here" (e.g. a
 * stale temporary-account cache is re-minted instead of hard-erroring). Only
 * genuine I/O errors (`EACCES`, `EISDIR`, ...) propagate. This is deliberately
 * distinct from `@cloudflare/workers-auth`'s `FileCredentialStore`, which
 * surfaces a corrupt *credential* file as a throw so the user can fix it.
 *
 * Files are written with mode `0o600` on creation and re-`chmod`'d on every
 * save (the `mode` option only applies on creation) so other local users on
 * shared hosts can't read the stored credentials.
 */
export function createTomlFileStorage<T extends object>(
	getPath: () => string
): ConfigStorage<T> {
	return {
		read: () => {
			const filePath = getPath();
			// Per the `ConfigStorage<T>.read()` contract, the empty state
			// returns `undefined` rather than throwing — that covers both a
			// missing file and a file that exists but can't be parsed as `T`.
			// The read itself is kept outside the try so genuine I/O errors
			// (`EACCES`, `EISDIR`, ...) still propagate; only the parse is
			// treated as "corrupt ⇒ empty".
			if (!existsSync(filePath)) {
				return undefined;
			}
			const contents = readFileSync(filePath);
			try {
				return parseTOML(contents) as T;
			} catch {
				return undefined;
			}
		},
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

// `getAuthConfigFilePath` is owned by `@cloudflare/workers-auth` (it's the
// authority for the plaintext-TOML store's path layout, which the encrypted-
// file store also needs for legacy migration). It accepts an optional auth
// profile name and resolves to that profile's TOML file. Wrangler re-exports
// it from `./user` for back-compat with the historical wrangler-side import
// path.
export { getAuthConfigFilePath };

/**
 * A plaintext-TOML `AuthConfigStorage` for a specific auth profile, located
 * under the global Wrangler config directory.
 *
 * This is the *plaintext profile-file* primitive used by profile management
 * (listing / deleting named profiles by their `.toml` file in
 * `profile-store.ts`) and by tests that seed a particular profile's file
 * directly. The production login / logout / refresh path does NOT use this —
 * it goes through the keyring-aware `storageFactory` wired up in `user.ts`,
 * which may persist the active profile's credentials in an encrypted file
 * instead of plaintext TOML.
 */
export function defaultAuthConfigStorage(profile?: string): AuthConfigStorage {
	return createTomlFileStorage<UserAuthConfig>(() =>
		getAuthConfigFilePath(profile)
	);
}

/**
 * Write a profile's plaintext-TOML auth config to disk.
 *
 * Profile-explicit plaintext counterpart to `writeAuthCredentials` (which
 * targets the active profile via the keyring-aware store).
 */
export function writeAuthConfigFile(
	config: UserAuthConfig,
	profile?: string
): void {
	defaultAuthConfigStorage(profile).write(config);
}

/**
 * Read a profile's plaintext-TOML auth config from disk. Returns `undefined`
 * when the file does not exist (per the `ConfigStorage<T>` contract); parse
 * errors on an existing file still propagate.
 *
 * Profile-explicit plaintext counterpart to `readAuthCredentials`.
 */
export function readAuthConfigFile(
	profile?: string
): UserAuthConfig | undefined {
	return defaultAuthConfigStorage(profile).read();
}
