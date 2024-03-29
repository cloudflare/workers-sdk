import type { CommonYargsArgv } from "../yargs-types";

export function Name(yargs: CommonYargsArgv) {
	return yargs.positional("name", {
		describe: "The name or binding of the DB",
		type: "string",
		demandOption: true,
	});
}

export function Database(yargs: CommonYargsArgv) {
	return yargs.positional("database", {
		describe: "The name or binding of the DB",
		type: "string",
		demandOption: true,
	});
}
