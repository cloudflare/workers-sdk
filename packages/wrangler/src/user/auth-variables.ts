import {
	getCloudflareApiEnvironmentFromEnv,
	getEnvironmentVariableFactory,
} from "@cloudflare/workers-utils";
import { logger } from "../logger";
import { getAccessHeaders } from "./access";

/**
 * `CLOUDFLARE_ACCOUNT_ID` overrides the account inferred from the current user.
 */
export const getCloudflareAccountIdFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_ACCOUNT_ID",
	deprecatedName: "CF_ACCOUNT_ID",
});

export const getCloudflareAPITokenFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_API_TOKEN",
	deprecatedName: "CF_API_TOKEN",
});
export const getCloudflareGlobalAuthKeyFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_API_KEY",
	deprecatedName: "CF_API_KEY",
});
export const getCloudflareGlobalAuthEmailFromEnv =
	getEnvironmentVariableFactory({
		variableName: "CLOUDFLARE_EMAIL",
		deprecatedName: "CF_EMAIL",
	});

/**
 * `WRANGLER_CLIENT_ID` is a UUID that is used to identify Wrangler
 * to the Cloudflare APIs.
 *
 * Normally you should not need to set this explicitly.
 * If you want to switch to the staging environment set the
 * `WRANGLER_API_ENVIRONMENT=staging` environment variable instead.
 */
export const getClientIdFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_CLIENT_ID",
	defaultValue: () =>
		getCloudflareApiEnvironmentFromEnv() === "staging"
			? "4b2ea6cc-9421-4761-874b-ce550e0e3def"
			: "54d11594-84e4-41aa-b438-e81b8fa78ee7",
});

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

export const getWranglerR2SqlAuthToken = getEnvironmentVariableFactory({
	variableName: "WRANGLER_R2_SQL_AUTH_TOKEN",
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
 * Get headers needed to authenticate with the Cloudflare auth domain (e.g. staging).
 *
 * Checks `WRANGLER_CF_AUTHORIZATION_TOKEN` first, then falls back to `getAccessHeaders`.
 */
export const getCloudflareAccessHeaders = async (): Promise<
	Record<string, string>
> => {
	const env = getEnvironmentVariableFactory({
		variableName: "WRANGLER_CF_AUTHORIZATION_TOKEN",
	})();

	// If the environment variable is defined, go ahead and use it.
	if (env !== undefined) {
		logger.debug("Using WRANGLER_CF_AUTHORIZATION_TOKEN from environment", env);
		return { Cookie: `CF_Authorization=${env}` };
	}

	return getAccessHeaders(getAuthDomainFromEnv());
};
