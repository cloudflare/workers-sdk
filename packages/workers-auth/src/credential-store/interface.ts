import type { AuthConfigStorage, UserAuthConfig } from "../config-file/auth";

/**
 * Pluggable backend for the persisted OAuth credentials.
 *
 * Concrete implementations:
 * - {@link FileCredentialStore} — the historical plaintext TOML file at
 *   `<globalWranglerConfigPath>/config/<env>.toml`. Used by default and as
 *   a fallback when keyring storage is unavailable.
 * - {@link EncryptedFileCredentialStore} — an AES-256-GCM-encrypted file at
 *   `<globalWranglerConfigPath>/config/<env>.enc`, with the encryption key
 *   stored in the OS keyring via a {@link KeyProvider}.
 *
 * Extends the consumer-facing {@link AuthConfigStorage} contract with two
 * keyring-specific extras:
 * - `kind`: discriminant so consumers can tell apart "plain file" and
 *   "encrypted file" stores without sniffing for methods.
 * - `describe()`: human-readable, possibly multi-line description (e.g.
 *   `"Encrypted file (path) with key in macOS Keychain"`) for surfaces
 *   like `wrangler whoami` that want richer copy than the raw `path()`.
 *
 * The interface is synchronous so it can be plugged into existing
 * `AuthConfigStorage` call sites without forcing every caller to become
 * async. Under the hood, both implementations use synchronous primitives
 * (subprocess `spawnSync`, `@napi-rs/keyring`'s sync `Entry` class,
 * `node:crypto` sync APIs, synchronous filesystem calls).
 */
export interface CredentialStore extends AuthConfigStorage {
	readonly kind: "file" | "encrypted-file";

	/**
	 * Human-readable description of where credentials are stored, suitable
	 * for consumers' `whoami`-style output. May be multi-line / richer
	 * than the raw `path()`.
	 */
	describe(): string;
}

export type { UserAuthConfig };
