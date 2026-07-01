import { getEnvironmentVariableFactory } from "@cloudflare/workers-utils";

/**
 * `CLOUDFLARE_ACCOUNT_ID` overrides the account inferred from the current user.
 */
export const getCloudflareAccountIdFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_ACCOUNT_ID",
	deprecatedName: "CF_ACCOUNT_ID",
});

export const getWranglerR2SqlAuthToken = getEnvironmentVariableFactory({
	variableName: "WRANGLER_R2_SQL_AUTH_TOKEN",
});

// The *credential* env-var getters (`CLOUDFLARE_API_TOKEN`,
// `CLOUDFLARE_API_KEY`, `CLOUDFLARE_EMAIL`) and the OAuth client-id getter
// (`WRANGLER_CLIENT_ID` / `CLOUDFLARE_OAUTH_CLIENT_ID`) now live in
// `@cloudflare/workers-auth` alongside the shared env→credential resolver, so
// every Cloudflare CLI shares one implementation. Re-exported here so existing
// `from "./auth-variables"` import paths keep working.
export {
	getClientIdFromEnv,
	getCloudflareAPITokenFromEnv,
	getCloudflareGlobalAuthEmailFromEnv,
	getCloudflareGlobalAuthKeyFromEnv,
} from "@cloudflare/workers-auth";
