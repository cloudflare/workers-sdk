export { FrameworkDetector } from "./detector";
export type { DetectionResult } from "./detector";
export {
	FRAMEWORKS,
	getFrameworkByName,
	getSSRFrameworks,
	getStaticFrameworks,
	requiresAdapter,
	getCompatibilityFlags,
	getMainEntryPoint,
	getAssetsConfig
} from "./frameworks";
export type { FrameworkConfig } from "./frameworks";
export {
	FrameworkDetectionError,
	handleDetectionFailure,
	provideBetterErrorMessages,
	showFrameworkHelp,
	suggestProjectSetup
} from "./error-handling";
export { installFrameworkAdapter } from "./adapters";
