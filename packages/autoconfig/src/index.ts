export type {
	AutoConfigContext,
	AutoConfigLogger,
	AutoConfigDialogs,
} from "./context";

export { getDetailsForAutoConfig } from "./details";
export { runAutoConfig, buildOperationsSummary } from "./run";

export { Framework } from "./frameworks/framework-class";
export type {
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

export type {
	AutoConfigDetails,
	AutoConfigDetailsForConfiguredProject,
	AutoConfigDetailsForNonConfiguredProject,
	AutoConfigOptions,
	AutoConfigSummary,
} from "./types";

export {
	AutoConfigDetectionError,
	AutoConfigFrameworkConfigurationError,
} from "./errors";

export { getInstalledPackageVersion } from "./frameworks/utils/packages";
