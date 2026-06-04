import { getEnvironmentVariableFactory } from "@cloudflare/workers-utils";

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

export const getWranglerR2SqlAuthToken = getEnvironmentVariableFactory({
	variableName: "WRANGLER_R2_SQL_AUTH_TOKEN",
});

// OAuth-flow-related env-var getters (`WRANGLER_CLIENT_ID`, `WRANGLER_AUTH_DOMAIN`,
// `WRANGLER_AUTH_URL`, `WRANGLER_TOKEN_URL`, `WRANGLER_REVOKE_URL`,
// `WRANGLER_CF_AUTHORIZATION_TOKEN`, `CLOUDFLARE_ACCESS_CLIENT_ID`,
// `CLOUDFLARE_ACCESS_CLIENT_SECRET`) have moved to `@cloudflare/workers-auth`
// alongside the OAuth flow itself.
