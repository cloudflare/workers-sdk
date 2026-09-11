/**
 * Dependencies that _are not_ bundled along with @cloudflare/containers-shared.
 *
 * These must be explicitly documented with a reason why they cannot be bundled.
 * This list is validated by `tools/deployments/validate-package-dependencies.ts`.
 */
export const EXTERNAL_DEPENDENCIES = [
	// Workspace packages kept external so consumers share a single copy of
	// runtime code and shared error classes.
	"@cloudflare/cli-shared-helpers",
	"@cloudflare/workers-utils",
];
