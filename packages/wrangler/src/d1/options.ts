import type { Argv } from "yargs";

export function Name(yargs: Argv) {
	return yargs.positional("name", {
		describe: "The name or binding of the DB",
		type: "string",
		demandOption: true,
	});
}
