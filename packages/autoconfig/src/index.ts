export type {
	AutoConfigContext,
	AutoConfigTarget,
	AutoConfigLogger,
	AutoConfigDialogs,
} from "./context";

export {
	getDetailsForAutoConfig,
	assertProjectCommandsAvailable,
} from "./details";
export { runAutoConfig, buildOperationsSummary } from "./run";

export { Framework } from "./frameworks/framework-class";
export type {
	BuildConfig,
	ConfigurationOptions,
	ConfigurationResults,
	PackageJsonScriptsOverrides,
} from "./frameworks/framework-class";

export { isFrameworkSupported } from "./frameworks";

export type {
	FrameworkInfo,
	AutoConfigFrameworkPackageInfo,
} from "./frameworks";

export { displayAutoConfigDetails, confirmAutoConfigDetails } from "./details";

export { migrateWranglerToCf } from "./wrangler-to-cf";
export { readWranglerConfig } from "./wrangler-to-cf/config-reader";
export type {
	MigrationBundler,
	MigrationFollowUp,
	WranglerConfigFile,
	WranglerToCfMigrationOptions,
	WranglerToCfMigrationResult,
} from "./wrangler-to-cf/types";

export type {
	AutoConfigDetails,
	AutoConfigCommandError,
	AutoConfigDetailsForConfiguredProject,
	AutoConfigDetailsForNonConfiguredProject,
	AutoConfigOptions,
	AutoConfigSummary,
} from "./types";

export {
	AutoConfigDetectionError,
	AutoConfigFrameworkConfigurationError,
} from "./errors";

export { getInstalledPackageVersion } from "@cloudflare/workers-utils";
