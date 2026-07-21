export { buildPagesFunctions, PagesFunctionsNoRoutesError } from "./build";
export type {
	BuildPagesFunctionsOptions,
	BuildPagesFunctionsResult,
	CollectedModule,
} from "./build";

export {
	generateConfigFromFileTree,
	compareRoutes,
	PagesFunctionsBuildError,
	PagesFunctionsError,
	PagesFunctionsErrorCode,
	writeRoutesModule,
	generateRoutesModuleSource,
	convertRoutesToGlobPatterns,
	convertRoutesToRoutesJSONSpec,
	optimizeRoutesJSONSpec,
	compareRoutesSimplified,
	consolidateRoutes,
	shortenRoute,
	RoutesValidationError,
	isRoutesJSONSpec,
	validateRoutes,
	getRoutesValidationErrorMessage,
	MAX_FUNCTIONS_ROUTES_RULES,
	MAX_FUNCTIONS_ROUTES_RULE_LENGTH,
	ROUTES_SPEC_VERSION,
	isValidIdentifier,
	normalizeIdentifier,
} from "./routing";
export type {
	HTTPMethod,
	Config,
	RouteConfig,
	RoutesJSONSpec,
} from "./routing";

export { toUrlPath } from "./paths";
export type { UrlPath } from "./paths";
