/**
 * Global flags available on all wrangler commands.
 * Extracted to a shared module for use by completions and the CLI parser.
 */
export const globalFlags = {
	v: {
		describe: "Show version number",
		alias: "version",
		type: "boolean",
	},
	cwd: {
		describe:
			"Run as if Wrangler was started in the specified directory instead of the current working directory",
		type: "string",
		requiresArg: true,
	},
	config: {
		alias: "c",
		describe: "Path to Wrangler configuration file",
		type: "string",
		requiresArg: true,
	},
	env: {
		alias: "e",
		describe:
			"Environment to use for operations, and for selecting .env and .dev.vars files",
		type: "string",
		requiresArg: true,
	},
	"env-file": {
		describe:
			"Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files",
		type: "string",
		array: true,
		requiresArg: true,
	},
	"experimental-provision": {
		describe: `Experimental: Enable automatic resource provisioning`,
		type: "boolean",
		default: true,
		hidden: true,
		alias: ["x-provision"],
	},
	"experimental-auto-create": {
		describe: "Automatically provision draft bindings with new resources",
		type: "boolean",
		default: true,
		hidden: true,
		alias: "x-auto-create",
	},
} as const;

export type GlobalFlags = typeof globalFlags;
