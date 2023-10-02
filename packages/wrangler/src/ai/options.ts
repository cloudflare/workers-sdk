import type { CommonYargsArgv } from "../yargs-types";

export function takeName(yargs: CommonYargsArgv) {
	return yargs.positional("name", {
		describe: "The name of the project",
		type: "string",
		demandOption: true,
	});
}

export function asJson(yargs: CommonYargsArgv) {
	return yargs.option("json", {
		describe: "return output as clean JSON",
		type: "boolean",
		default: false,
	});
}
