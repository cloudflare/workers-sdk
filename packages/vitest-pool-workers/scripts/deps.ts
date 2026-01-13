/**
 * Dependencies that _are not_ bundled along with @cloudflare/vitest-pool-workers.
 *
 * These must be explicitly documented with a reason why they cannot be bundled.
 * This list is validated by `tools/deployments/validate-package-dependencies.ts`.
 */
export const EXTERNAL_DEPENDENCIES = [
	// Bi-directional RPC library - used for test runner communication between processes
	"birpc",

	// CommonJS module lexer - native module for parsing CJS exports
	"cjs-module-lexer",

	// Value serialization - used for passing test data between worker and main process
	"devalue",

	// JavaScript bundler - cannot be bundled, used to bundle test files at runtime
	"esbuild",

	// Port allocation utility - needs to query actual ports at runtime
	"get-port",

	// Semantic versioning - used for version compatibility checks at runtime
	"semver",

	// Schema validation library - used throughout for runtime validation
	"zod",
];
