export type {
	RawConfig,
	Config,
	RawDevConfig,
	ConfigFields,
	RawEnvironment,
	ConfigBindingOptions,
} from "./config";
export * from "./config/environment";
export { partitionExports } from "./config/exports";
export type { ExportType, PartitionedExports } from "./config/exports";
export {
	getDurableObjectExports,
	hasDurableObjectExports,
} from "./config/durable-object-exports";
export {
	type RedirectedRawConfig,
	defaultWranglerConfig,
} from "./config/config";
export {
	formatConfigSnippet,
	configFormat,
	configFileName,
	experimental_readRawConfig,
} from "./config";
export {
	experimental_patchConfig,
	PatchConfigError,
} from "./config/patch-config";
export * from "./worker";
export * from "./types";
export {
	type Message,
	type Location,
	type ParseFile,
	ParseError,
	APIError,
	parseTOML,
	type PackageJSON,
	parsePackageJSON,
	parseJSON,
	parseJSONC,
	readFileSyncToBuffer,
	readFileSync,
	indexLocation,
	searchLocation,
	parseHumanDuration,
	parseNonHyphenedUuid,
	parseByteSize,
} from "./parse";
export {
	getBindingTypeFriendlyName,
	isPagesConfig,
	normalizeAndValidateConfig,
	type NormalizeAndValidateConfigArgs,
	type ConfigBindingFieldName,
	isValidR2BucketName,
	bucketFormatMessage,
} from "./config/validation";

import * as validation from "./config/validation";

/**
 * @deprecated new code should use getBindingTypeFriendlyName() instead
 */
export const friendlyBindingNames = validation.friendlyBindingNames;

export {
	type BindingLocalSupport,
	getBindingLocalSupport,
} from "./config/binding-local-support";

export { validatePagesConfig } from "./config/validation-pages";

export { Diagnostics } from "./config/diagnostics";

export {
	hasProperty,
	isRequiredProperty,
	isOptionalProperty,
} from "./config/validation-helpers";

export {
	resolveWranglerConfigPath,
	findWranglerConfig,
	isRedirectedConfig,
} from "./config/config-helpers";
export type { ResolveConfigPathOptions } from "./config/config-helpers";
export * from "./errors";
export { assertNever } from "./assert-never";

export * from "./constants";

export { mapWorkerMetadataBindings } from "./map-worker-metadata-bindings";
export { constructWranglerConfig } from "./construct-wrangler-config";

export {
	getBooleanEnvironmentVariableFactory,
	getEnvironmentVariableFactory,
} from "./environment-variables/factory";

export * from "./environment-variables/misc-variables";

export {
	getGlobalConfigPath,
	getGlobalWranglerCachePath,
} from "./global-wrangler-config-path";
export type { GetGlobalConfigPathOptions } from "./global-wrangler-config-path";

export { isCompatDate, getTodaysCompatDate } from "./compatibility-date";
export type { CompatDate } from "./compatibility-date";

export { isDockerfile } from "./config/validation";

export { isDirectory, removeDir, removeDirSync } from "./fs-helpers";

export {
	type EphemeralDirectory,
	getWranglerHiddenDirPath,
	getWranglerTmpDir,
	sweepStaleWranglerTmpDirs,
} from "./wrangler-tmp-dir";

export { MetricsRegistry } from "./prometheus-metrics";
export type { Counter } from "./prometheus-metrics";

export type { Tunnel, TunnelOptions } from "./tunnel";
export { startTunnel } from "./tunnel";
export { spawnCloudflared } from "./cloudflared";

export * from "./cfetch";

export { fetchLatestNpmVersion } from "./update-check";
export type { NpmVersionCheckResult } from "./update-check";

export { LOGGER_LEVELS } from "./logger";
export type { Logger, LoggerLevel } from "./logger";

export { retryOnAPIFailure } from "./retry";
export { formatTime } from "./format-time";
export {
	getHostFromRoute,
	getHostFromUrl,
	getZoneFromRoute,
} from "./route-utils";

export type { PackageManager } from "./package-manager";
export {
	NpmPackageManager,
	PnpmPackageManager,
	YarnPackageManager,
	BunPackageManager,
} from "./package-manager";

export {
	checkWorkerNameValidity,
	toValidWorkerName,
	getWorkerName,
	getWorkerNameFromProject,
} from "./worker-name";
