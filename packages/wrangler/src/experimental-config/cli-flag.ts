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
