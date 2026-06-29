import {
	getBooleanEnvironmentVariableFactory,
	getCloudflareApiEnvironmentFromEnv,
	getEnvironmentVariableFactory,
} from "@cloudflare/workers-utils";

/**
 * `WRANGLER_AUTH_DOMAIN` is the URL base domain that is used
 * to access OAuth URLs for the Cloudflare APIs.
 *
 * Normally you should not need to set this explicitly.
 * If you want to switch to the staging environment set the
 * `WRANGLER_API_ENVIRONMENT=staging` environment variable instead.
 */
export const getAuthDomainFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_AUTH_DOMAIN",
	defaultValue: () =>
		getCloudflareApiEnvironmentFromEnv() === "staging"
			? "dash.staging.cloudflare.com"
			: "dash.cloudflare.com",
});

/**
 * `WRANGLER_AUTH_URL` is the path that is used to access OAuth
 * for the Cloudflare APIs.
 *
 * Normally you should not need to set this explicitly.
 * If you want to switch to the staging environment set the
 * `WRANGLER_API_ENVIRONMENT=staging` environment variable instead.
 */
export const getAuthUrlFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_AUTH_URL",
	defaultValue: () => `https://${getAuthDomainFromEnv()}/oauth2/auth`,
});

/**
 * `WRANGLER_TOKEN_URL` is the path that is used to exchange an OAuth
 * token for an API token.
 *
 * Normally you should not need to set this explicitly.
 * If you want to switch to the staging environment set the
 * `WRANGLER_API_ENVIRONMENT=staging` environment variable instead.
 */
export const getTokenUrlFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_TOKEN_URL",
	defaultValue: () => `https://${getAuthDomainFromEnv()}/oauth2/token`,
});

/**
 * `WRANGLER_REVOKE_URL` is the path that is used to exchange an OAuth
 * refresh token for a new OAuth token.
 *
 * Normally you should not need to set this explicitly.
 * If you want to switch to the staging environment set the
 * `WRANGLER_API_ENVIRONMENT=staging` environment variable instead.
 */
export const getRevokeUrlFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_REVOKE_URL",
	defaultValue: () => `https://${getAuthDomainFromEnv()}/oauth2/revoke`,
});

/**
 * `CLOUDFLARE_ACCESS_CLIENT_ID` is the Client ID of a Cloudflare Access Service Token.
 * Used together with `CLOUDFLARE_ACCESS_CLIENT_SECRET` to authenticate with
 * Access-protected domains in non-interactive environments (e.g. CI).
 *
 * @see https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/
 */
export const getAccessClientIdFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_ACCESS_CLIENT_ID",
});

/**
 * `CLOUDFLARE_ACCESS_CLIENT_SECRET` is the Client Secret of a Cloudflare Access Service Token.
 * Used together with `CLOUDFLARE_ACCESS_CLIENT_ID` to authenticate with
 * Access-protected domains in non-interactive environments (e.g. CI).
 *
 * @see https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/
 */
export const getAccessClientSecretFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_ACCESS_CLIENT_SECRET",
});

/**
 * `WRANGLER_CF_AUTHORIZATION_TOKEN` is an explicit `CF_Authorization` cookie value
 * used to authenticate against the OAuth auth domain when it is Access-protected
 * (typically staging). When set, the OAuth flow skips Access detection and uses
 * this token directly.
 */
export const getCfAuthorizationTokenFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_CF_AUTHORIZATION_TOKEN",
});

/**
 * `CLOUDFLARE_AUTH_USE_KEYRING` overrides where OAuth credentials are stored.
 *
 * - `true`  — force-store credentials in the OS keychain. If the keychain
 *             cannot be reached, the resolver throws rather than silently
 *             falling back, so security-sensitive callers know their
 *             explicit opt-in did not take effect.
 * - `false` — force-store credentials in the legacy plaintext TOML file,
 *             even if the consumer's persistent `keyring_enabled` preference
 *             is set.
 * - unset   — fall back to the consumer's persistent preference (e.g. the
 *             one written by `wrangler login --use-keyring`).
 */
export const getCloudflareAuthUseKeyringFromEnv =
	getBooleanEnvironmentVariableFactory({
		variableName: "CLOUDFLARE_AUTH_USE_KEYRING",
	});
