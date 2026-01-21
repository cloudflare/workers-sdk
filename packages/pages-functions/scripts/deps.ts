/**
 * Dependencies that _are not_ bundled along with pages-functions.
 *
 * These must be explicitly documented with a reason why they cannot be bundled.
 * This list is validated by `tools/deployments/validate-package-dependencies.ts`.
 */
export const EXTERNAL_DEPENDENCIES = [
	// Imported via resolved absolute path into generated worker code.
	// Wrangler/esbuild bundles it when building the final worker.
	"path-to-regexp",
];
