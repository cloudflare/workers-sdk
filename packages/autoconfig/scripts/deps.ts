/**
 * Dependencies that _are not_ bundled along with @cloudflare/autoconfig.
 *
 * These must be explicitly documented with a reason why they cannot be bundled.
 * This list is validated by `tools/deployments/validate-package-dependencies.ts`.
 */
export const EXTERNAL_DEPENDENCIES = [
	// Published workspace packages that consumers must install alongside autoconfig.
	// They are kept external to share a single copy with wrangler and other SDK tools.
	"@cloudflare/cli-shared-helpers",
	"@cloudflare/workers-utils",
];
