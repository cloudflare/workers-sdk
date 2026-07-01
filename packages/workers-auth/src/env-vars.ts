import {
	getCloudflareApiEnvironmentFromEnv,
	getEnvironmentVariableFactory,
} from "@cloudflare/workers-utils";

/**
 * The OAuth client ID identifying the CLI to the Cloudflare OAuth server.
 * Defaults to the first-party app for the active API environment, so a
 * delegated tool can refresh a token minted by that app. A CLI that registers
 * its own OAuth app should set this.
 */
export const getClientIdFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_OAUTH_CLIENT_ID",
	deprecatedName: "WRANGLER_CLIENT_ID",
	defaultValue: () =>
		getCloudflareApiEnvironmentFromEnv() === "staging"
			? "4b2ea6cc-9421-4761-874b-ce550e0e3def"
			: "54d11594-84e4-41aa-b438-e81b8fa78ee7",
});

/** The OAuth URL base domain. Usually auto-configured from the API environment. */
export const getAuthDomainFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_AUTH_DOMAIN",
	deprecatedName: "WRANGLER_AUTH_DOMAIN",
	defaultValue: () =>
		getCloudflareApiEnvironmentFromEnv() === "staging"
			? "dash.staging.cloudflare.com"
			: "dash.cloudflare.com",
});

/** The OAuth authorize URL. */
export const getAuthUrlFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_AUTH_URL",
	deprecatedName: "WRANGLER_AUTH_URL",
	defaultValue: () => `https://${getAuthDomainFromEnv()}/oauth2/auth`,
});

/** The OAuth token-exchange URL. */
export const getTokenUrlFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_TOKEN_URL",
	deprecatedName: "WRANGLER_TOKEN_URL",
	defaultValue: () => `https://${getAuthDomainFromEnv()}/oauth2/token`,
});

/** The OAuth token-revocation URL. */
export const getRevokeUrlFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_REVOKE_URL",
	deprecatedName: "WRANGLER_REVOKE_URL",
	defaultValue: () => `https://${getAuthDomainFromEnv()}/oauth2/revoke`,
});

/**
 * Cloudflare Access Service Token client ID, used with
 * {@link getAccessClientSecretFromEnv} to authenticate with Access-protected
 * domains in non-interactive environments (e.g. CI).
 *
 * @see https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/
 */
export const getAccessClientIdFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_ACCESS_CLIENT_ID",
});

/**
 * Cloudflare Access Service Token client secret, paired with
 * {@link getAccessClientIdFromEnv}.
 */
export const getAccessClientSecretFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_ACCESS_CLIENT_SECRET",
});

/**
 * An explicit `CF_Authorization` cookie value used to authenticate against the
 * OAuth auth domain when it is Access-protected (typically staging). When set,
 * the OAuth flow skips Access detection and uses this token directly.
 */
export const getCfAuthorizationTokenFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_CF_AUTHORIZATION_TOKEN",
	deprecatedName: "WRANGLER_CF_AUTHORIZATION_TOKEN",
});
