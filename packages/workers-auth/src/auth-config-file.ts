/**
 * The data that may be read from the on-disk user auth config file.
 */
export interface UserAuthConfig {
	oauth_token?: string;
	refresh_token?: string;
	expiration_time?: string;
	scopes?: string[];
	/** @deprecated - this field was only provided by the deprecated v1 `wrangler config` command. */
	api_token?: string;
}

/**
 * Pluggable persistence for the user auth config.
 *
 * This package does not ship a default implementation — the consumer injects
 * one via {@link OAuthFlowContext.storage} (and into {@link getAPIToken} /
 * {@link readStoredAuthState}). Wrangler's default reads/writes a TOML file
 * under the global Wrangler config directory; other CLIs can use a different
 * location and/or serialization format (e.g. a JSONC file under a different
 * CLI's XDG config directory).
 */
export interface AuthConfigStorage {
	/**
	 * Read and parse the stored auth config.
	 * @throws if the backing store is missing or cannot be parsed. Callers treat
	 * a throw as "not logged in via local OAuth".
	 */
	read(): UserAuthConfig;
	/** Serialize and persist the auth config. */
	write(config: UserAuthConfig): void;
	/** Remove the backing store (used on logout). */
	clear(): void;
	/** Human-readable location of the backing store, for display and warnings. */
	path(): string;
}
