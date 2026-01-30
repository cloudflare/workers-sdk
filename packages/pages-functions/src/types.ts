/**
 * Types for Pages Functions routing and compilation.
 */

/**
 * HTTP methods supported by Pages Functions.
 */
export type HTTPMethod =
	| "HEAD"
	| "OPTIONS"
	| "GET"
	| "POST"
	| "PUT"
	| "PATCH"
	| "DELETE";

/**
 * A URL path that starts with a forward slash.
 */
export type UrlPath = `/${string}`;

/**
 * Configuration for a single route in a Pages Functions project.
 */
export interface RouteConfig {
	/** The path pattern for this route (e.g., "/api/:id") */
	routePath: UrlPath;
	/** The mount path for middleware matching */
	mountPath: UrlPath;
	/** Optional HTTP method restriction */
	method?: HTTPMethod;
	/** Middleware handler references */
	middleware?: string | string[];
	/** Module handler references */
	module?: string | string[];
}

/**
 * Parsed configuration from a functions directory.
 */
export interface FunctionsConfig {
	routes: RouteConfig[];
}

/**
 * The _routes.json specification for Pages deployment.
 */
export interface RoutesJSONSpec {
	version: number;
	description?: string;
	include: string[];
	exclude: string[];
}

/**
 * Options for compiling a functions directory.
 */
export interface CompileOptions {
	/** Base URL for routes. Default: "/" */
	baseURL?: string;
	/** Fallback service binding name. Default: "ASSETS" */
	fallbackService?: string;
}

/**
 * Result of compiling a functions directory.
 */
export interface CompileResult {
	/** Generated worker entrypoint code (JavaScript) */
	code: string;
	/** Route configuration for tooling/debugging */
	routes: RouteConfig[];
	/** _routes.json content for Pages deployment */
	routesJson: RoutesJSONSpec;
}
