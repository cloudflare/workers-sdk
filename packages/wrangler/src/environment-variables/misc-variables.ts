import { getEnvironmentVariableFactory } from "./factory";

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
