/**
 * Dependencies that _are not_ bundled along with @cloudflare/cli-shared-helpers.
 *
 * This package uses unbundle mode (tsdown unbundle: true), so all dependencies
 * remain as bare import specifiers in the dist output and are resolved at
 * install time by consumers.
 *
 * This list is validated by `tools/deployments/validate-package-dependencies.ts`.
 */
export const EXTERNAL_DEPENDENCIES = [
	// UI prompt primitives used for interactive CLI flows
	"@clack/core",

	// Terminal string styling
	"chalk",

	// CI environment detection
	"ci-info",

	// Cross-platform child process spawning
	"cross-spawn",

	// Efficient terminal log updating (spinners, progress)
	"log-update",
];
