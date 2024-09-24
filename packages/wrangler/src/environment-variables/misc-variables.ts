import { getEnvironmentVariableFactory } from "./factory";

/**
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
	defaultValue: () => "create cloudflare@^2.5.0",
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

/**
 * `WRANGLER_LOG_SANITIZE` specifies whether we sanitize debug logs.
 *
 * By default we do, since debug logs could be added to GitHub issues and shouldn't include sensitive information.
 */
export const getSanitizeLogs = getEnvironmentVariableFactory({
	variableName: "WRANGLER_LOG_SANITIZE",
	defaultValue() {
		return "true";
	},
});

/**
 * `WRANGLER_OUTPUT_FILE_DIRECTORY` specifies a directory where we should write a file containing output data in ND-JSON format.
 *
 * If this is set a random file will be created in this directory, and certain Wrangler commands will write entries to this file.
 * This is overridden by the `WRANGLER_OUTPUT_FILE_PATH` environment variable.
 */
export const getOutputFileDirectoryFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_OUTPUT_FILE_DIRECTORY",
});

/**
 * `WRANGLER_OUTPUT_FILE_PATH` specifies a path to a file where we should write output data in ND-JSON format.
 *
 * If this is set certain Wrangler commands will write entries to this file.
 * This overrides the `WRANGLER_OUTPUT_FILE_DIRECTORY` environment variable.
 */
export const getOutputFilePathFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_OUTPUT_FILE_PATH",
});

/**
 * `WRANGLER_CI_MATCH_TAG` specifies a worker tag
 *
 * If this is set, Wrangler will ensure the worker being targeted has this tag
 */
export const getCIMatchTag = getEnvironmentVariableFactory({
	variableName: "WRANGLER_CI_MATCH_TAG",
});

/**
 * `WRANGLER_BUILD_CONDITIONS` specifies the "build conditions" to use when importing packages at build time.
 *
 * See https://nodejs.org/api/packages.html#conditional-exports
 * and https://esbuild.github.io/api/#how-conditions-work.
 *
 * If this is set, Wrangler will configure esbuild to use this list of conditions.
 * The format is a string of comma separated conditions.
 */
export const getBuildConditionsFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_BUILD_CONDITIONS",
});

/**
 * `WRANGLER_BUILD_PLATFORM` specifies the "build platform" to use when importing packages at build time.
 *
 * See https://esbuild.github.io/api/#platform
 * and https://esbuild.github.io/api/#how-conditions-work.
 *
 * If this is set, Wrangler will configure esbuild to use this platform.
 */
export const getBuildPlatformFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_BUILD_PLATFORM",
});
