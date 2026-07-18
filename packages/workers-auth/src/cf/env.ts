import { getEnvironmentVariableFactory } from "@cloudflare/workers-utils";

/**
 * `CLOUDFLARE_CLIENT_ID` is the UUID of cf's registered OAuth app, used to
 * identify the `cf` CLI to the Cloudflare OAuth server.
 *
 * Normally you should not need to set this explicitly. cf has a single
 * registered OAuth app (there is no separate staging app), so the default is
 * the same regardless of `WRANGLER_API_ENVIRONMENT`; override via the env var
 * if a different app is ever needed.
 */
export const getClientIdFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_CLIENT_ID",
	defaultValue: () => "cbca97e7-c331-4cdd-8fd8-e25a451b98bf",
});
