/**
 * Dependencies that _are not_ bundled along with @cloudflare/kv-asset-handler.
 *
 * These must be explicitly documented with a reason why they cannot be bundled.
 * This list is validated by `tools/deployments/validate-package-dependencies.ts`.
 */
export const EXTERNAL_DEPENDENCIES = [
	// MIME type database - kept external to allow users to get security updates
	// without requiring a new release of kv-asset-handler
	"mime",
];
