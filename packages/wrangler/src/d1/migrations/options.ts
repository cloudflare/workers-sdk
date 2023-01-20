import { Database } from "../options";
import type { CommonYargsArgv } from "../../yargs-types";

export function DatabaseWithLocal(yargs: CommonYargsArgv) {
	return Database(yargs)
		.option("local", {
			describe:
				"Execute commands/files against a local DB for use with wrangler dev --local",
			type: "boolean",
		})
		.option("persist-to", {
			describe:
				"Specify directory to use for local persistence (you must use --local with this flag)",
			type: "string",
			requiresArg: true,
		})
		.implies("persist-to", "local");
}
