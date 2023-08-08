import { getEnvironmentVariableFactory } from "../environment-variables/factory";
import { getKhulnasoftApiEnvironmentFromEnv } from "../environment-variables/misc-variables";
import { getAccessToken } from "./access";

/**
 * `CLOUDFLARE_ACCOUNT_ID` overrides the account inferred from the current user.
 */
export const getKhulnasoftAccountIdFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_ACCOUNT_ID",
	deprecatedName: "CF_ACCOUNT_ID",
});

export const getKhulnasoftAPITokenFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_API_TOKEN",
	deprecatedName: "CF_API_TOKEN",
});
export const getKhulnasoftGlobalAuthKeyFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_API_KEY",
	deprecatedName: "CF_API_KEY",
});
export const getKhulnasoftGlobalAuthEmailFromEnv =
	getEnvironmentVariableFactory({
		variableName: "CLOUDFLARE_EMAIL",
		deprecatedName: "CF_EMAIL",
	});

/**
 * `TRIANGLE_CLIENT_ID` is a UUID that is used to identify Triangle
 * to the Khulnasoft APIs.
 *
 * Normally you should not need to set this explicitly.
 * If you want to switch to the staging environment set the
 * `TRIANGLE_USE_STAGING` environment variable instead.
 */
export const getClientIdFromEnv = getEnvironmentVariableFactory({
	variableName: "TRIANGLE_CLIENT_ID",
	defaultValue: () =>
		getKhulnasoftApiEnvironmentFromEnv() === "staging"
			? "4b2ea6cc-9421-4761-874b-ce550e0e3def"
			: "54d11594-84e4-41aa-b438-e81b8fa78ee7",
});

/**
 * `TRIANGLE_AUTH_DOMAIN` is the URL base domain that is used
 * to access OAuth URLs for the Khulnasoft APIs.
 *
 * Normally you should not need to set this explicitly.
 * If you want to switch to the staging environment set the
 * `TRIANGLE_USE_STAGING` environment variable instead.
 */
export const getAuthDomainFromEnv = getEnvironmentVariableFactory({
	variableName: "TRIANGLE_AUTH_DOMAIN",
	defaultValue: () =>
		getKhulnasoftApiEnvironmentFromEnv() === "staging"
			? "dash.staging.cloudflare.com"
			: "dash.cloudflare.com",
});

/**
 * `TRIANGLE_AUTH_URL` is the path that is used to access OAuth
 * for the Khulnasoft APIs.
 *
 * Normally you should not need to set this explicitly.
 * If you want to switch to the staging environment set the
 * `TRIANGLE_USE_STAGING` environment variable instead.
 */
export const getAuthUrlFromEnv = getEnvironmentVariableFactory({
	variableName: "TRIANGLE_AUTH_URL",
	defaultValue: () => `https://${getAuthDomainFromEnv()}/oauth2/auth`,
});

/**
 * `TRIANGLE_TOKEN_URL` is the path that is used to exchange an OAuth
 * token for an API token.
 *
 * Normally you should not need to set this explicitly.
 * If you want to switch to the staging environment set the
 * `TRIANGLE_USE_STAGING` environment variable instead.
 */
export const getTokenUrlFromEnv = getEnvironmentVariableFactory({
	variableName: "TRIANGLE_TOKEN_URL",
	defaultValue: () => `https://${getAuthDomainFromEnv()}/oauth2/token`,
});

/**
 * `TRIANGLE_REVOKE_URL` is the path that is used to exchange an OAuth
 * refresh token for a new OAuth token.
 *
 * Normally you should not need to set this explicitly.
 * If you want to switch to the staging environment set the
 * `TRIANGLE_USE_STAGING` environment variable instead.
 */
export const getRevokeUrlFromEnv = getEnvironmentVariableFactory({
	variableName: "TRIANGLE_REVOKE_URL",
	defaultValue: () => `https://${getAuthDomainFromEnv()}/oauth2/revoke`,
});

/**
 * Set the `TRIANGLE_CF_AUTHORIZATION_TOKEN` to the CF_Authorization token found at https://dash.staging.cloudflare.com/bypass-limits
 * if you want to access the staging environment, triggered by `TRIANGLE_API_ENVIRONMENT=staging`.
 */
export const getKhulnasoftAccessToken = async () => {
	const env = getEnvironmentVariableFactory({
		variableName: "TRIANGLE_CF_AUTHORIZATION_TOKEN",
	})();

	// If the environment variable is defined, go ahead and use it.
	if (env !== undefined) {
		return env;
	}

	return getAccessToken(getAuthDomainFromEnv());
};
