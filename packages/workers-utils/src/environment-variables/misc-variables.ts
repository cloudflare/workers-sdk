import path from "node:path";
import { dedent } from "ts-dedent";
import { UserError } from "../errors";
import { getGlobalWranglerConfigPath } from "../global-wrangler-config-path";
import {
	getBooleanEnvironmentVariableFactory,
	getEnvironmentVariableFactory,
} from "./factory";
import type { Config } from "../config";

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
export const getWranglerSendMetricsFromEnv =
	getBooleanEnvironmentVariableFactory({
		variableName: "WRANGLER_SEND_METRICS",
	});

/**
 * `WRANGLER_SEND_ERROR_REPORTS` can override whether we attempt to send error reports to Sentry.
 */
export const getWranglerSendErrorReportsFromEnv =
	getBooleanEnvironmentVariableFactory({
		variableName: "WRANGLER_SEND_ERROR_REPORTS",
	});

/**
 * Set `WRANGLER_API_ENVIRONMENT` environment variable to "staging" to tell Wrangler to hit the staging APIs rather than production.
 */
export const getCloudflareApiEnvironmentFromEnv = getEnvironmentVariableFactory(
	{
		variableName: "WRANGLER_API_ENVIRONMENT",
		defaultValue: () => "production" as const,
		choices: ["production", "staging"] as const,
	}
);

/**
 * The compliance region to use for the API requests.
 */
export type ComplianceConfig = Partial<Pick<Config, "compliance_region">>;

/** Used for commands that explicitly do not support compliance regions other than "public" */
export const COMPLIANCE_REGION_CONFIG_PUBLIC: ComplianceConfig = {
	compliance_region: "public",
};

/**
 * Used for commands where there is no configuration available and
 * we rely upon the CLOUDFLARE_COMPLIANCE_REGION environment variable
 * to determine the compliance region.
 */
export const COMPLIANCE_REGION_CONFIG_UNKNOWN: ComplianceConfig = {
	compliance_region: undefined,
};

const getCloudflareComplianceRegionFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_COMPLIANCE_REGION",
	choices: ["public", "fedramp_high"] as const,
});

/**
 * Set `CLOUDFLARE_COMPLIANCE_REGION` environment variable to "fedramp_high"
 * or set the `compliance_region` property in the Wrangler configuration
 * to tell Wrangler to run in FedRAMP High compliance region mode, rather than "public" mode.
 */
export const getCloudflareComplianceRegion = (
	complianceConfig: ComplianceConfig
) => {
	const complianceRegionFromEnv = getCloudflareComplianceRegionFromEnv();
	if (
		complianceRegionFromEnv !== undefined &&
		complianceConfig?.compliance_region !== undefined &&
		complianceRegionFromEnv !== complianceConfig.compliance_region
	) {
		throw new UserError(dedent`
			The compliance region has been set to different values in two places:
			 - \`CLOUDFLARE_COMPLIANCE_REGION\` environment variable: \`${complianceRegionFromEnv}\`
			 - \`compliance_region\` configuration property: \`${complianceConfig.compliance_region}\`
			`);
	}
	return (
		complianceRegionFromEnv || complianceConfig?.compliance_region || "public"
	);
};

const getCloudflareApiBaseUrlFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_API_BASE_URL",
	deprecatedName: "CF_API_BASE_URL",
});

/**
 * `CLOUDFLARE_API_BASE_URL` specifies the URL to the Cloudflare API.
 *
 * If this environment variable is not set, it will default to a URL computed from the
 * Cloudflare compliance region and the API environment.
 */
export const getCloudflareApiBaseUrl = (complianceConfig: ComplianceConfig) =>
	getCloudflareApiBaseUrlFromEnv() ??
	`https://api${getComplianceRegionSubdomain(complianceConfig)}${getStagingSubdomain()}.cloudflare.com/client/v4`;

/**
 * Compute the subdomain for the compliance region.
 */
export function getComplianceRegionSubdomain(
	complianceConfig: ComplianceConfig
): string {
	return getCloudflareComplianceRegion(complianceConfig) === "fedramp_high"
		? ".fed"
		: "";
}

/**
 * Compute the subdomain for the staging environment.
 */
function getStagingSubdomain(): string {
	return getCloudflareApiEnvironmentFromEnv() === "staging" ? ".staging" : "";
}

/**
 * `WRANGLER_LOG_SANITIZE` specifies whether we sanitize debug logs.
 *
 * By default we do, since debug logs could be added to GitHub issues and shouldn't include sensitive information.
 */
export const getSanitizeLogs = getBooleanEnvironmentVariableFactory({
	variableName: "WRANGLER_LOG_SANITIZE",
	defaultValue: true,
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
 * `WRANGLER_CI_MATCH_TAG` specifies a Worker tag
 *
 * If this is set, Wrangler will ensure the Worker being targeted has this tag
 */
export const getCIMatchTag = getEnvironmentVariableFactory({
	variableName: "WRANGLER_CI_MATCH_TAG",
});

/**
 * `WRANGLER_CI_OVERRIDE_NAME` specifies a Worker name
 *
 * If this is set, Wrangler will override the Worker name with this one
 */
export const getCIOverrideName = getEnvironmentVariableFactory({
	variableName: "WRANGLER_CI_OVERRIDE_NAME",
});

/**
 * `WRANGLER_CI_OVERRIDE_NETWORK_MODE_HOST` specifies whether --network=host should be set
 *
 * If this is set to true, Wrangler will use the --network=host flag when calling out to docker to build container images
 */
export const getCIOverrideNetworkModeHost = getEnvironmentVariableFactory({
	variableName: "WRANGLER_CI_OVERRIDE_NETWORK_MODE_HOST",
});

/**
 * `WRANGLER_CI_GENERATE_PREVIEW_ALIAS` specifies whether to generate a preview alias during version upload
 *
 * If this is set to true, Wrangler will attempt to autogenerate the preview alias by using the branch
 * name. If the branch name is too long and an alias cannot be created, a warning will be printed to the console.
 */
export const getCIGeneratePreviewAlias = getEnvironmentVariableFactory({
	variableName: "WRANGLER_CI_GENERATE_PREVIEW_ALIAS",
	defaultValue: () => "false" as const,
	choices: ["true", "false"] as const,
});

/**
 * `WORKERS_CI_BRANCH` is the branch name exposed by Workers CI
 *
 */
export const getWorkersCIBranchName = getEnvironmentVariableFactory({
	variableName: "WORKERS_CI_BRANCH",
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

/**
 * `WRANGLER_REGISTRY_PATH` specifies the file based dev registry folder
 */
export const getRegistryPath = getEnvironmentVariableFactory({
	variableName: "WRANGLER_REGISTRY_PATH",
	defaultValue() {
		return path.join(getGlobalWranglerConfigPath(), "registry");
	},
});

/**
 * `WRANGLER_D1_EXTRA_LOCATION_CHOICES` is an internal variable to let D1 team target their testing environments.
 *
 * External accounts cannot access testing environments, so should not set this variable.
 */
export const getD1ExtraLocationChoices: () => string | undefined =
	getEnvironmentVariableFactory({
		variableName: "WRANGLER_D1_EXTRA_LOCATION_CHOICES",
	});

/**
 * `WRANGLER_DOCKER_BIN` specifies the path to a docker binary.
 *
 * By default it's `docker`.
 */
export const getDockerPath = getEnvironmentVariableFactory({
	variableName: "WRANGLER_DOCKER_BIN",
	defaultValue() {
		return "docker";
	},
});

export const getSubdomainMixedStateCheckDisabled =
	getBooleanEnvironmentVariableFactory({
		variableName: "WRANGLER_DISABLE_SUBDOMAIN_MIXED_STATE_CHECK",
		defaultValue: false,
	});

/**
/**
 * `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV` specifies whether to load vars for local dev from `.env` files.
 */
export const getCloudflareLoadDevVarsFromDotEnv =
	getBooleanEnvironmentVariableFactory({
		variableName: "CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV",
		defaultValue: true,
	});

/**
 * `CLOUDFLARE_INCLUDE_PROCESS_ENV` specifies whether to include the `process.env` in vars loaded from `.env` for local development.
 */
export const getCloudflareIncludeProcessEnvFromEnv =
	getBooleanEnvironmentVariableFactory({
		variableName: "CLOUDFLARE_INCLUDE_PROCESS_ENV",
		defaultValue: false,
	});

export const getTraceHeader = getEnvironmentVariableFactory({
	variableName: "WRANGLER_TRACE_ID",
});

export const getDisableConfigWatching = getBooleanEnvironmentVariableFactory({
	variableName: "WRANGLER_CI_DISABLE_CONFIG_WATCHING",
	defaultValue: false,
});

/**
 * Hide the Wrangler version banner and command status (deprecated/experimental) warnings
 */
export const getWranglerHideBanner = getBooleanEnvironmentVariableFactory({
	variableName: "WRANGLER_HIDE_BANNER",
	defaultValue: false,
});

/**
 * `CLOUDFLARE_ENV` specifies the currently selected Wrangler/Cloudflare environment.
 */
export const getCloudflareEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_ENV",
});

/**
 * `OPEN_NEXT_DEPLOY` is an environment variables that indicates that the current process is being
 * run by the open-next deploy command
 */
export const getOpenNextDeployFromEnv = getEnvironmentVariableFactory({
	variableName: "OPEN_NEXT_DEPLOY",
});

/**
 * `X_LOCAL_EXPLORER` enables the local explorer UI at /cdn-cgi/explorer.
 * This is an experimental feature flag. Defaults to false when not set.
 */
export const getLocalExplorerFromEnv = getBooleanEnvironmentVariableFactory({
	variableName: "X_LOCAL_EXPLORER",
	defaultValue: false,
});
