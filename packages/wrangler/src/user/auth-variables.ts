import { execaSync } from "execa";
import { getEnvironmentVariableFactory } from "../environment-variables/factory";
import { getCloudflareApiEnvironmentFromEnv } from "../environment-variables/misc-variables";
import { logger } from "../logger";

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
 * `WRANGLER_USE_STAGING` environment variable instead.
 */
export const getClientIdFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_CLIENT_ID",
	defaultValue:
		getCloudflareApiEnvironmentFromEnv() === "staging"
			? "4b2ea6cc-9421-4761-874b-ce550e0e3def"
			: "54d11594-84e4-41aa-b438-e81b8fa78ee7",
});

/**
 * `WRANGLER_AUTH_URL` is the path that is used to access OAuth
 * for the Cloudflare APIs.
 *
 * Normally you should not need to set this explicitly.
 * If you want to switch to the staging environment set the
 * `WRANGLER_USE_STAGING` environment variable instead.
 */
export const getAuthUrlFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_AUTH_URL",
	defaultValue:
		getCloudflareApiEnvironmentFromEnv() === "staging"
			? "https://dash.staging.cloudflare.com/oauth2/auth"
			: "https://dash.cloudflare.com/oauth2/auth",
});

/**
 * `WRANGLER_TOKEN_URL` is the path that is used to exchange an OAuth
 * token for an API token.
 *
 * Normally you should not need to set this explicitly.
 * If you want to switch to the staging environment set the
 * `WRANGLER_USE_STAGING` environment variable instead.
 */
export const getTokenUrlFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_TOKEN_URL",
	defaultValue:
		getCloudflareApiEnvironmentFromEnv() === "staging"
			? "https://dash.staging.cloudflare.com/oauth2/token"
			: "https://dash.cloudflare.com/oauth2/token",
});

/**
 * `WRANGLER_REVOKE_URL` is the path that is used to exchange an OAuth
 * refresh token for a new OAuth token.
 *
 * Normally you should not need to set this explicitly.
 * If you want to switch to the staging environment set the
 * `WRANGLER_USE_STAGING` environment variable instead.
 */
export const getRevokeUrlFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_REVOKE_URL",
	defaultValue:
		getCloudflareApiEnvironmentFromEnv() === "staging"
			? "https://dash.staging.cloudflare.com/oauth2/revoke"
			: "https://dash.cloudflare.com/oauth2/revoke",
});

/**
 * Set the `WRANGLER_CF_AUTHORIZATION_TOKEN` to the CF_Authorization token found at https://dash.staging.cloudflare.com/bypass-limits
 * if you want to access the staging environment, triggered by `WRANGLER_API_ENVIRONMENT=staging`.
 */
export const getCloudflareAccessToken = () => {
	const env = getEnvironmentVariableFactory({
		variableName: "WRANGLER_CF_AUTHORIZATION_TOKEN",
	})();

	// If the environment variable is defined, go ahead and use it.
	if (env !== undefined) {
		return env;
	}

	const cloudflareAuthHost = new URL(getTokenUrlFromEnv()).host;

	// Try to get the access token via cloudflared
	try {
		const { stdout: token } = execaSync("cloudflared", [
			`access`,
			`token`,
			`--app`,
			cloudflareAuthHost,
		]);
		if (
			!token.includes(
				"Unable to find token for provided application. Please run login command to generate token."
			)
		) {
			return token;
		}
	} catch (e) {
		// OK that didn't work... move on.
		logger.debug(e);
	}

	// No luck. Let's try to get it by logging in via cloudflared.
	try {
		const { stdout: login } = execaSync("cloudflared", [
			`access`,
			`login`,
			cloudflareAuthHost,
		]);
		const match = /Successfully fetched your token:\s+(.+)/.exec(login);
		if (match) {
			console.log(match);
			return match[1];
		}
	} catch (e) {
		// Didn't work either... moving along.
		logger.debug(e);
	}
	// Still no luck give up and give the user some ideas of next steps.
	throw Error(
		"When trying to access staging environment we need an 'access token'.\n" +
			"We were unable to get one automatically using cloudflared. Run with debug logging to see more detailed errors.\n" +
			"Alternatively, you could provide your own access token by setting the WRANGLER_CF_AUTHORIZATION_TOKEN environment variable\n" +
			"to a token that is generated at https://dash.staging.cloudflare.com/bypass-limits."
	);
};
