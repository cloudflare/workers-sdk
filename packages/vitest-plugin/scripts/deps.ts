/**
 * Dependencies that _are not_ bundled along with @cloudflare/vitest-plugin.
 *
 * These must be explicitly documented with a reason why they cannot be bundled.
 * This list is validated by `tools/deployments/validate-package-dependencies.ts`.
 */
export const EXTERNAL_DEPENDENCIES = [
	// Loads its WebAssembly module relative to its own files, so it can't be
	// bundled. Used to hash Pages assets for the `ASSETS` binding.
	"blake3-wasm",

	// Has optional native N-API bindings for performance - may not bundle correctly
	"cjs-module-lexer",

	// Native binary - cannot be bundled, used to bundle test files at runtime
	"esbuild",

	// Used for config validation at runtime - must be available when package is installed
	"zod",
];
