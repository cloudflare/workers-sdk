/**
 * Dependencies that _are not_ bundled along with @cloudflare/vite-plugin.
 *
 * These must be explicitly documented with a reason why they cannot be bundled.
 * This list is validated by `tools/deployments/validate-package-dependencies.ts`.
 */
export const EXTERNAL_DEPENDENCIES = [
	// Must be external - resolved at runtime when bundling user's worker code
	// to provide Node.js compatibility polyfills
	"unenv",

	// Has optional native bindings (bufferutil, utf-8-validate) for performance;
	// commonly shared with other packages to avoid duplication
	"ws",
];
