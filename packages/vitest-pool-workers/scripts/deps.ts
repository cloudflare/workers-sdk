/**
 * Dependencies that _are not_ bundled along with @cloudflare/vitest-pool-workers.
 *
 * These must be explicitly documented with a reason why they cannot be bundled.
 * This list is validated by `tools/deployments/validate-package-dependencies.ts`.
 */
export const EXTERNAL_DEPENDENCIES = [
	// Has optional native N-API bindings for performance - may not bundle correctly
	"cjs-module-lexer",

	// Native binary - cannot be bundled, used to bundle test files at runtime
	"esbuild",
];
