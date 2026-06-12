/**
 * Dependencies that _are not_ bundled along with @cloudflare/deploy-helpers.
 *
 * These must be explicitly documented with a reason why they cannot be bundled.
 * This list is validated by `tools/deployments/validate-package-dependencies.ts`.
 */
export const EXTERNAL_DEPENDENCIES = [
	// Workspace packages kept external so consumers share a single copy of
	// types and runtime code (e.g. ParseError instanceof checks).
	"@cloudflare/cli-shared-helpers",
	"@cloudflare/workers-utils",
	"miniflare",

	// These are externalized to avoid duplication in wrangler's bundle,
	// which already bundles these packages itself.
	"blake3-wasm",
	"chalk",
	"command-exists",
	"dotenv",
	"p-queue",
	"pretty-bytes",
	"undici",

	// Externalized so wrangler bundles a single shared zod copy instead of
	// inlining one via this package. Declared as a peerDependency (the
	// consumer provides zod).
	"zod",
];
