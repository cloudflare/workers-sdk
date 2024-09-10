import { Database } from "../options";

export const MigrationOptions = {
	...Database,
	local: {
		describe:
			"Execute commands/files against a local DB for use with wrangler dev",
		type: "boolean",
	},
	remote: {
		describe:
			"Execute commands/files against a remote DB for use with wrangler dev --remote",
		type: "boolean",
	},
	preview: {
		describe: "Execute commands/files against a preview D1 DB",
		type: "boolean",
		default: false,
	},
	"persist-to": {
		describe:
			"Specify directory to use for local persistence (you must use --local with this flag)",
		type: "string",
		requiresArg: true,
		implies: "local",
	},
} as const;
