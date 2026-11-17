/**
 * Dependencies that _are not_ bundled along with @cloudflare/codemods.
 *
 * These must be explicitly documented with a reason why they cannot be bundled.
 * This list is validated by `tools/deployments/validate-package-dependencies.ts`.
 */
export const EXTERNAL_DEPENDENCIES = [
	// The Wrangler migration lives in autoconfig. Keeping it external shares a single
	// copy with cf instead of bundling all of autoconfig into the codemods.
	"@cloudflare/autoconfig",
];
