import {
	getCloudflareApiEnvironmentFromEnv,
	getEnvironmentVariableFactory,
} from "@cloudflare/workers-utils";

/**
 * `CLOUDFLARE_ACCOUNT_ID` overrides the account inferred from the current user.
 */
export const getCloudflareAccountIdFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_ACCOUNT_ID",
	deprecatedName: "CF_ACCOUNT_ID",
});

/**
 * `WRANGLER_CLIENT_ID` is the UUID of Wrangler's registered OAuth app, used to
 * identify Wrangler to the Cloudflare OAuth server.
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

export const getWranglerR2SqlAuthToken = getEnvironmentVariableFactory({
	variableName: "WRANGLER_R2_SQL_AUTH_TOKEN",
});

// The *credential* env-var getters (`CLOUDFLARE_API_TOKEN`,
// `CLOUDFLARE_API_KEY`, `CLOUDFLARE_EMAIL`) now live in
// `@cloudflare/workers-auth` alongside the shared env→credential resolver, so
// every Cloudflare CLI shares one implementation. Re-exported here so existing
// `from "./auth-variables"` import paths keep working.
export {
	getCloudflareAPITokenFromEnv,
	getCloudflareGlobalAuthEmailFromEnv,
	getCloudflareGlobalAuthKeyFromEnv,
} from "@cloudflare/workers-auth";
