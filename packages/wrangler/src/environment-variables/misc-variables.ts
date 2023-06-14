import { getEnvironmentVariableFactory } from "./factory";

/**
 * `WRANGLER_C3_COMMAND` can override the command used by `wrangler init` when delegating to C3.
 *
 * By default this will use `create cloudflare@2`.
 * If you want to test the integration between wrangler and C3 locally, you can do the following:
 *
 * ```sh
 * # Ensure both Wrangler and C3 are built
 * npm run build
 * # Run the command from the Wrangler package directory
 * cd packages/wrangler
 * # Tell Wrangler to use the local version of create-cloudflare
 * WRANGLER_C3_COMMAND="run create-cloudflare" npx wrangler init temp
 * ```
 *
 * This makes use of the fact we have a monorepo and npm will delegate to the local
 * version of a package if possible.
 * Since the way `wrangler init` is written, it will always use `npm` (or equivalent) to run C3, rather than `npx` (or equivalent).
 * Therefore we have added a `create-cloudflare` script to the Wrangler `package.json` that will work with `npm run create-cloudflare`.
 * But that means that you must run the `npx wrangler init` command from the `wrangler` package directory.
 */
export const getC3CommandFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_C3_COMMAND",
	defaultValue: () => "create cloudflare@2",
});

/**
 * `WRANGLER_SEND_METRICS` can override whether we attempt to send metrics information to Sparrow.
 */
export const getWranglerSendMetricsFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_SEND_METRICS",
});

/**
 * Set `WRANGLER_API_ENVIRONMENT` environment variable to "staging" to tell Wrangler to hit the staging APIs rather than production.
 */
export const getCloudflareApiEnvironmentFromEnv = getEnvironmentVariableFactory(
	{
		variableName: "WRANGLER_API_ENVIRONMENT",
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
