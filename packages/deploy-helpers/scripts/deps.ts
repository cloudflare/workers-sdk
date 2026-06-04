/**
 * Dependencies that _are not_ bundled along with @cloudflare/deploy-helpers.
 *
 * These must be explicitly documented with a reason why they cannot be bundled.
 * This list is validated by `tools/deployments/validate-package-dependencies.ts`.
 */
export const EXTERNAL_DEPENDENCIES = [
	// Workspace package kept external so consumers share a single copy of
	// workers-utils types and runtime code (e.g. ParseError instanceof checks).
	"@cloudflare/workers-utils",
];
