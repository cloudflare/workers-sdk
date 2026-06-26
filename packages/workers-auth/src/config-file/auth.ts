import { createFileStorage } from "./file-storage";
import type { ConfigStorage } from ".";
import type { ConfigFileLocation } from "./file-storage";

/**
 * The data that may be read from the on-disk user auth config file.
 */
export interface UserAuthConfig {
	oauth_token?: string;
	refresh_token?: string;
	expiration_time?: string;
	scopes?: string[];
	/** @deprecated - this field was only provided by a deprecated v1 `config` command. */
	api_token?: string;
}

export type AuthConfigStorage = ConfigStorage<UserAuthConfig>;

/**
 * Read the raw user auth config from the given {@link ConfigFileLocation}.
 *
 * Location-based file I/O for consumers that need the on-disk config directly
 * (without the storage abstraction). Throws if the file is missing or cannot be
 * parsed — callers typically treat that as "not logged in via local OAuth".
 */
export function readAuthConfig(location: ConfigFileLocation): UserAuthConfig {
	return createFileStorage<UserAuthConfig>(location).read();
}

/**
 * Write the raw user auth config to the given {@link ConfigFileLocation},
 * creating the file with owner-only permissions.
 */
export function writeAuthConfig(
	location: ConfigFileLocation,
	config: UserAuthConfig
): void {
	createFileStorage<UserAuthConfig>(location).write(config);
}
