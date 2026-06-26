import { createFileStorage } from "./config-file/file-storage";
import type { AuthConfigStorage, UserAuthConfig } from "./config-file/auth";
import type { ConfigFileLocation } from "./config-file/file-storage";
import type { OAuthFlowLogger } from "./context";

export interface RefreshToken {
	value: string;
}

export interface AccessToken {
	value: string;
	expiry: string;
}

/**
 * Transient state that is shared across the steps of a single OAuth login flow
 * within one CLI command. This state is not file-backed; it lives only for
 * the duration of an interactive login.
 */
export interface OAuthFlowState {
	authorizationCode?: string;
	codeChallenge?: string;
	codeVerifier?: string;
	hasAuthCodeBeenExchangedForAccessToken?: boolean;
	stateQueryParam?: string;
}

/**
 * The auth state that is stored on disk in the user auth config file (TOML).
 * Read on demand by {@link readStoredAuthState} — never cached at module scope
 * so that environment variables loaded after import (e.g. from `.env`) take
 * priority correctly.
 */
export interface StoredAuthState {
	accessToken?: AccessToken;
	refreshToken?: RefreshToken;
	scopes?: string[];
	/** @deprecated - this field was only provided by the deprecated v1 `wrangler config` command. */
	deprecatedApiToken?: string;
}

/**
 * Latch shared at module scope so the deprecated-v1-api-token warning fires
 * at most once per process.
 */
let hasWarnedAboutDeprecatedV1ApiToken = false;

/**
 * Reset the deprecated-v1-api-token warning latch. Exported for tests only.
 */
export function _resetDeprecatedV1ApiTokenWarningLatch(): void {
	hasWarnedAboutDeprecatedV1ApiToken = false;
}

/**
 * Read the on-disk auth state. Called on demand from every site that needs the
 * stored OAuth tokens or the deprecated v1 `api_token`, rather than being cached
 * at module scope, so that environment-based credentials loaded after module
 * import are honoured.
 *
 * Public entry point — configured by *location* only. Internally builds the
 * file storage; consumers never see the storage abstraction.
 *
 * @return an empty object when no auth config file exists or the file cannot
 * be parsed — the caller treats this as "not logged in via local OAuth".
 *
 * @param options.storage where (and in what format) the auth config file lives.
 * @param options.configOverride seed the state from an in-memory config (used by
 * the OAuth login flow before it writes to disk).
 * @param options.warningLogger if provided, a one-time warning is emitted when a
 * deprecated v1 `api_token` is found on disk.
 */
export function readStoredAuthState(options: {
	storage: ConfigFileLocation;
	configOverride?: UserAuthConfig;
	warningLogger?: Pick<OAuthFlowLogger, "warn">;
}): StoredAuthState {
	return readStoredAuthStateFromStorage({
		configOverride: options.configOverride,
		warningLogger: options.warningLogger,
		storage: createFileStorage<UserAuthConfig>(options.storage),
	});
}

/**
 * Storage-based core of {@link readStoredAuthState}. Internal: the OAuth flow
 * and credential resolvers already hold a storage (built once from the
 * context's location), so they read through this directly rather than rebuilding
 * one per call.
 *
 * @param options.storage the storage to read from.
 * @param options.configOverride seed the state from an in-memory config.
 * @param options.warningLogger one-time deprecated-v1-`api_token` warning sink.
 */
export function readStoredAuthStateFromStorage(options: {
	configOverride?: UserAuthConfig;
	warningLogger?: Pick<OAuthFlowLogger, "warn">;
	storage: AuthConfigStorage;
}): StoredAuthState {
	const { configOverride, warningLogger, storage } = options;

	let parsed: UserAuthConfig;
	try {
		parsed = configOverride ?? storage.read();
	} catch {
		return {};
	}

	// eslint-disable-next-line @typescript-eslint/no-deprecated -- api_token is a deprecated property, but still needs to be supported for backwards compatibility so we need to handle appropriately here
	const { oauth_token, refresh_token, expiration_time, scopes, api_token } =
		parsed;

	if (oauth_token) {
		return {
			accessToken: {
				value: oauth_token,
				// If there is no `expiration_time` field then set it to an old date, to cause it to expire immediately.
				expiry: expiration_time ?? "2000-01-01:00:00:00+00:00",
			},
			refreshToken: { value: refresh_token ?? "" },
			scopes,
		};
	}

	if (api_token) {
		if (!hasWarnedAboutDeprecatedV1ApiToken && warningLogger) {
			hasWarnedAboutDeprecatedV1ApiToken = true;
			warningLogger.warn(
				"It looks like you have used Wrangler v1's `config` command to login with an API token\n" +
					`from ${
						configOverride === undefined ? storage.path() : "in-memory config"
					}.\n` +
					"This is no longer supported in the current version of Wrangler.\n" +
					"If you wish to authenticate via an API token then please set the `CLOUDFLARE_API_TOKEN` environment variable."
			);
		}
		return { deprecatedApiToken: api_token };
	}

	return {};
}
