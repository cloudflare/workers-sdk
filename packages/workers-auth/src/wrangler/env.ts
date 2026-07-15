import {
	getCloudflareApiEnvironmentFromEnv,
	getEnvironmentVariableFactory,
} from "@cloudflare/workers-utils";

/**
 * `WRANGLER_CLIENT_ID` is the UUID of Wrangler's registered OAuth app, used to
 * identify Wrangler to the Cloudflare OAuth server.
 *
 * This is wrangler CLI config (the app UUIDs and the `WRANGLER_*` variable
 * name are Wrangler's), so it lives in the `/wrangler` layer rather than the
 * shared core — a future `/cf` entrypoint has its own OAuth app.
 *
 * Normally you should not need to set this explicitly. To switch to the staging
 * environment set `WRANGLER_API_ENVIRONMENT=staging` instead.
 */
export const getClientIdFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_CLIENT_ID",
	defaultValue: () =>
		getCloudflareApiEnvironmentFromEnv() === "staging"
			? "4b2ea6cc-9421-4761-874b-ce550e0e3def"
			: "54d11594-84e4-41aa-b438-e81b8fa78ee7",
});
