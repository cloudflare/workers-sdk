import {
	getCloudflareApiEnvironmentFromEnv,
	getEnvironmentVariableFactory,
} from "@cloudflare/workers-utils";

/**
 * `CLOUDFLARE_CLIENT_ID` is the UUID of cf's registered OAuth app, used to
 * identify the `cf` CLI to the Cloudflare OAuth server.
 *
 * Normally you should not need to set this explicitly. To switch to the staging
 * environment set `WRANGLER_API_ENVIRONMENT=staging` instead.
 *
 * TODO(cf): replace the placeholder default UUIDs below with cf's real
 * production / staging OAuth app client IDs.
 */
export const getClientIdFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_CLIENT_ID",
	defaultValue: () =>
		getCloudflareApiEnvironmentFromEnv() === "staging"
			? "00000000-0000-0000-0000-00000000staging"
			: "00000000-0000-0000-0000-0000000000prod",
});
