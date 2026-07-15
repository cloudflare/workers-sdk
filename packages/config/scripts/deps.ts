/**
 * Dependencies that _are not_ bundled along with @cloudflare/config.
 *
 * These must be explicitly documented with a reason why they cannot be bundled.
 * This list is validated by `tools/deployments/validate-package-dependencies.ts`.
 */
export const EXTERNAL_DEPENDENCIES = [
	// Kept external so consumers that bundle this package (wrangler,
	// deploy-helpers, vite-plugin) share a single zod copy instead of
	// inlining one per consumed entry point.
	"zod",
];
