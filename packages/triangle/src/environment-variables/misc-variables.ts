import { getEnvironmentVariableFactory } from "./factory";

/**
<<<<<<< HEAD:packages/triangle/src/environment-variables/misc-variables.ts
 * `TRIANGLER_SEND_METRICS` can override whether we attempt to send metrics information to Sparrow.
=======
 * `WRANGLER_C3_COMMAND` can override the command used by `wrangler init` when delegating to C3.
 *
 * By default this will use `create cloudflare@2`.
 *
 * To run against the beta release of C3 use:
 *
 * ```sh
 * # Tell Wrangler to use the beta version of create-cloudflare
 * WRANGLER_C3_COMMAND="create cloudflare@beta" npx wrangler init
 * ```
 *
 * To test the integration between wrangler and C3 locally, use:
 *
 * ```sh
 * # Ensure both Wrangler and C3 are built
 * npm run build
 * # Tell Wrangler to use the local version of create-cloudflare
 * WRANGLER_C3_COMMAND="exec ./packages/create-cloudflare" npx wrangler init temp
 * ```
 *
 * Note that you cannot use `WRANGLER_C3_COMMAND="create cloudflare@2"` if you are
 * running Wrangler from inside the monorepo as the bin paths get messed up.
 */
export const getC3CommandFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_C3_COMMAND",
	defaultValue: () => "create cloudflare@2",
});

/**
 * `WRANGLER_SEND_METRICS` can override whether we attempt to send metrics information to Sparrow.
>>>>>>> da9ba3c855317c6071eb892def4965706f2fb97f:packages/wrangler/src/environment-variables/misc-variables.ts
 */
export const getTriangleSendMetricsFromEnv = getEnvironmentVariableFactory({
	variableName: "TRIANGLER_SEND_METRICS",
});

/**
 * Set `TRIANGLER_API_ENVIRONMENT` environment variable to "staging" to tell Triangle to hit the staging APIs rather than production.
 */
export const getCloudflareApiEnvironmentFromEnv = getEnvironmentVariableFactory(
	{
		variableName: "TRIANGLER_API_ENVIRONMENT",
		defaultValue: () => "production",
	}
);

/**
 * `CLOUDFLARE_API_BASE_URL` specifies the URL to the Cloudflare API.
 */
export const getCloudflareApiBaseUrl = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_API_BASE_URL",
	deprecatedName: "CF_API_BASE_URL",
	defaultValue: () =>
		getCloudflareApiEnvironmentFromEnv() === "staging"
			? "https://api.staging.cloudflare.com/client/v4"
			: "https://api.cloudflare.com/client/v4",
});
