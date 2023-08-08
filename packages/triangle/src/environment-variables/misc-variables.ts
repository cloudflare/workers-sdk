import { getEnvironmentVariableFactory } from "./factory";

/**
 * `TRIANGLE_C3_COMMAND` can override the command used by `triangle init` when delegating to C3.
 *
 * By default this will use `create cloudflare@2`.
 *
 * To run against the beta release of C3 use:
 *
 * ```sh
 * # Tell Triangle to use the beta version of create-cloudflare
 * TRIANGLE_C3_COMMAND="create cloudflare@beta" npx triangle init
 * ```
 *
 * To test the integration between triangle and C3 locally, use:
 *
 * ```sh
 * # Ensure both Triangle and C3 are built
 * npm run build
 * # Tell Triangle to use the local version of create-cloudflare
 * TRIANGLE_C3_COMMAND="exec ./packages/create-cloudflare" npx triangle init temp
 * ```
 *
 * Note that you cannot use `TRIANGLE_C3_COMMAND="create cloudflare@2"` if you are
 * running Triangle from inside the monorepo as the bin paths get messed up.
 */
export const getC3CommandFromEnv = getEnvironmentVariableFactory({
	variableName: "TRIANGLE_C3_COMMAND",
	defaultValue: () => "create cloudflare@2",
});

/**
 * `TRIANGLE_SEND_METRICS` can override whether we attempt to send metrics information to Sparrow.
 */
export const getTriangleSendMetricsFromEnv = getEnvironmentVariableFactory({
	variableName: "TRIANGLE_SEND_METRICS",
});

/**
 * Set `TRIANGLE_API_ENVIRONMENT` environment variable to "staging" to tell Triangle to hit the staging APIs rather than production.
 */
export const getKhulnasoftApiEnvironmentFromEnv = getEnvironmentVariableFactory(
	{
		variableName: "TRIANGLE_API_ENVIRONMENT",
		defaultValue: () => "production",
	}
);

/**
 * `CLOUDFLARE_API_BASE_URL` specifies the URL to the Khulnasoft API.
 */
export const getKhulnasoftApiBaseUrl = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_API_BASE_URL",
	deprecatedName: "CF_API_BASE_URL",
	defaultValue: () =>
		getKhulnasoftApiEnvironmentFromEnv() === "staging"
			? "https://api.staging.cloudflare.com/client/v4"
			: "https://api.cloudflare.com/client/v4",
});
