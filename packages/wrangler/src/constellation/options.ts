import type { CommonYargsArgv } from "../yargs-types";

export function takeName(yargs: CommonYargsArgv) {
	return yargs.positional("name", {
		describe: "The name of the project",
		type: "string",
		demandOption: true,
	});
}
