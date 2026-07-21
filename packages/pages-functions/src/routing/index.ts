export {
	generateConfigFromFileTree,
	compareRoutes,
	PagesFunctionsBuildError,
	PagesFunctionsError,
	PagesFunctionsErrorCode,
} from "./filepath-routing";
export { writeRoutesModule, generateRoutesModuleSource } from "./routes";
export type { HTTPMethod, Config, RouteConfig } from "./routes";
export {
	convertRoutesToGlobPatterns,
	convertRoutesToRoutesJSONSpec,
	optimizeRoutesJSONSpec,
	compareRoutes as compareRoutesSimplified,
} from "./routes-transformation";
export type { RoutesJSONSpec } from "./routes-transformation";
export { consolidateRoutes, shortenRoute } from "./routes-consolidation";
export {
	RoutesValidationError,
	isRoutesJSONSpec,
	validateRoutes,
	getRoutesValidationErrorMessage,
} from "./routes-validation";
export {
	MAX_FUNCTIONS_ROUTES_RULES,
	MAX_FUNCTIONS_ROUTES_RULE_LENGTH,
	ROUTES_SPEC_VERSION,
} from "./constants";
export { isValidIdentifier, normalizeIdentifier } from "./identifiers";
