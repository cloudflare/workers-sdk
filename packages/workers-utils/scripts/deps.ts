/**
 * Dependencies that _are not_ bundled along with @cloudflare/workers-utils.
 *
 * These must be explicitly documented with a reason why they cannot be bundled.
 * This list is validated by `tools/deployments/validate-package-dependencies.ts`.
 */
export const EXTERNAL_DEPENDENCIES = [
	// dotenv is also used by downstream consumers. Keeping it external allows
	// their final bundles to deduplicate it instead of embedding another copy
	// inside workers-utils.
	"dotenv",

	// Bundling `undici` would produce a duplicate copy in every downstream
	// consumer that already depends on undici (e.g. wrangler), which breaks
	// `instanceof Request`/`Response`/`Headers` checks across the boundary
	// and prevents `setGlobalDispatcher` / proxy configuration from applying
	// to the bundled copy. Keeping it external lets the package manager
	// deduplicate undici to a single shared instance.
	"undici",
];
