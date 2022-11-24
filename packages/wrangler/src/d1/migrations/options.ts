import { Database } from "../options";
import type { Argv } from "yargs";

export function DatabaseWithLocal(yargs: Argv) {
	return Database(yargs)
		.option("local", {
			describe:
				"Execute commands/files against a local DB for use with wrangler dev --local",
			type: "boolean",
		})
		.option("persist-to", {
			describe: "Specify directory to use for local persistence (for --local)",
			type: "string",
			requiresArg: true,
		})
		.implies("persist-to", "local");
}
