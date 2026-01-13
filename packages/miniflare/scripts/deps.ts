/**
 * Dependencies that _are not_ bundled along with miniflare.
 *
 * These must be explicitly documented with a reason why they cannot be bundled.
 * This list is validated by `tools/deployments/validate-package-dependencies.ts`.
 */
export const EXTERNAL_DEPENDENCIES = [
	// Source map support for better error stack traces - needs to be loaded at runtime
	"@cspotcode/source-map-support",

	// JavaScript parser used for code analysis - complex parser that's better kept external
	"acorn",

	// AST walker for acorn - companion to acorn parser
	"acorn-walk",

	// Synchronous process exit hooks - uses native bindings
	"exit-hook",

	// Glob pattern matching - small utility kept external for consistency
	"glob-to-regexp",

	// Image processing library with native platform-specific binaries
	"sharp",

	// Gracefully stop HTTP servers - needs runtime integration
	"stoppable",

	// HTTP client used for fetch implementation - large dependency better kept external
	"undici",

	// Cloudflare's JavaScript runtime - native binary, cannot be bundled
	"workerd",

	// WebSocket implementation - needs native bindings for performance
	"ws",

	// Error formatting library - kept external for easier debugging
	"youch",

	// Schema validation library - used throughout for runtime validation
	"zod",
];
