/**
 * Shared yargs definition for the `--experimental-new-config` flag.
 */
export const experimentalNewConfigArg = {
	"experimental-new-config": {
		describe: "[experimental] Use cloudflare.config.ts and wrangler.config.ts",
		type: "boolean",
		default: false,
		hidden: true,
		alias: "x-new-config",
	},
} as const;

/**
 * Shared yargs definition for the `--experimental-cf-build-output` flag.
 *
 * Used by `wrangler build` (alongside `--experimental-new-config`).
 */
export const experimentalCfBuildOutputArg = {
	"experimental-cf-build-output": {
		describe:
			"[experimental] Emit a Build Output API directory under `.cloudflare/output/` (requires --experimental-new-config)",
		type: "boolean",
		default: false,
		hidden: true,
		alias: "x-cf-build-output",
	},
} as const;
