/**
 * Dependencies that _are not_ bundled along with @cloudflare/vite-plugin.
 *
 * These must be explicitly documented with a reason why they cannot be bundled.
 * This list is validated by `tools/deployments/validate-package-dependencies.ts`.
 */
export const EXTERNAL_DEPENDENCIES = [
	// The preset resolves its runtime polyfill files from the installed package.
	"@cloudflare/unenv-preset",

	// Miniflare loads runtime Workers and native dependencies from its package.
	"miniflare",

	// Wrangler resolves its runtime resources from its installed package and is a peer.
	"wrangler",

	// Must be external - resolved at runtime when bundling user's worker code
	// to provide Node.js compatibility polyfills
	"unenv",

	// workerd contains a native binary, so must be external. Imported by the
	// bundled `@cloudflare/runtime-types` (runtime type generation).
	"workerd",

	// Has optional native bindings (bufferutil, utf-8-validate) for performance;
	// commonly shared with other packages to avoid duplication
	"ws",
];
