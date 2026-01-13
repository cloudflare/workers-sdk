/**
 * Dependencies that _are not_ bundled along with @cloudflare/vite-plugin.
 *
 * These must be explicitly documented with a reason why they cannot be bundled.
 * This list is validated by `tools/deployments/validate-package-dependencies.ts`.
 */
export const EXTERNAL_DEPENDENCIES = [
	// Fetch server adapter for Remix - needs runtime resolution for framework integration
	"@remix-run/node-fetch-server",

	// Deep object merging utility - used at runtime for config merging
	"defu",

	// Port allocation utility - needs to query actual ports at runtime
	"get-port",

	// Terminal color output - small utility kept external
	"picocolors",

	// Fast glob pattern matching - used for file discovery at runtime
	"tinyglobby",

	// Node.js polyfills preset - must be external as it's resolved at runtime when bundling user's code
	"unenv",

	// WebSocket implementation - needs native bindings for dev server communication
	"ws",
];
