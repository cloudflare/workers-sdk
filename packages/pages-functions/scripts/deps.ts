/**
 * Dependencies that _are not_ bundled along with pages-functions.
 *
 * These must be explicitly documented with a reason why they cannot be bundled.
 * This list is validated by `tools/deployments/validate-package-dependencies.ts`.
 */
export const EXTERNAL_DEPENDENCIES = [
	// Native binary with platform-specific builds - cannot be bundled.
	// Used to parse function files and extract exports.
	"esbuild",
];
