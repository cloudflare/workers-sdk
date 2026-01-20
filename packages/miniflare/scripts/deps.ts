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

	// Large HTTP client with optional native dependencies; commonly shared
	// with other packages to avoid version conflicts and duplication
	"undici",

	// Native binary - Cloudflare's JavaScript runtime cannot be bundled
	"workerd",

	// Has optional native bindings (bufferutil, utf-8-validate) for performance;
	// commonly shared with other packages to avoid duplication
	"ws",

	// Must be external - dynamically required at runtime via require("youch")
	// for lazy loading of pretty error pages
	"youch",

	// Large validation library; commonly shared as a dependency
	// to avoid version conflicts and bundle size duplication
	"zod",
];
