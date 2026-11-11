import type { ConfigStorage } from ".";
import type { ProcessOwnerChecker } from "../core/process-owner";

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

export interface AuthConfigStorage extends ConfigStorage<UserAuthConfig> {
	/** Pin a backend and reuse the flow's process-identity cache for its writes. */
	getForTransaction?(owners?: ProcessOwnerChecker): AuthConfigStorage;
}
