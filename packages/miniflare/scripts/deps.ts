/**
 * Dependencies that _are not_ bundled along with miniflare.
 *
 * These must be explicitly documented with a reason why they cannot be bundled.
 * This list is validated by `tools/deployments/validate-package-dependencies.ts`.
 */
export const EXTERNAL_DEPENDENCIES = [
	// Must be external - uses require.resolve() and require.cache manipulation
	// to load fresh instances of the module at runtime (see sourcemap.ts)
	"@cspotcode/source-map-support",

	// Native binary with platform-specific builds - cannot be bundled
	"sharp",

	// Must be external - dynamically required at runtime in worker threads via
	// require("undici") for synchronous fetch operations (see fetch-sync.ts)
	"undici",

	// Native binary - Cloudflare's JavaScript runtime cannot be bundled
	"workerd",

	// Has optional native bindings (bufferutil, utf-8-validate) for performance;
	// bundling would lose these optimizations and fall back to JS implementations
	"ws",

	// Must be external - dynamically required at runtime via require("youch")
	// for lazy loading of pretty error pages
	"youch",
];
