/**
 * Dependencies that _are not_ bundled along with @cloudflare/runtime-types.
 *
 * These must be explicitly documented with a reason why they cannot be bundled.
 * This list is validated by `tools/deployments/validate-package-dependencies.ts`.
 */
export const EXTERNAL_DEPENDENCIES = [
	// Kept external so consumers install the Miniflare version that is paired
	// with this package instead of embedding a second copy in the bundle.
	"miniflare",

	// Native binary and runtime-resolved worker module; cannot be bundled.
	"workerd",
];
