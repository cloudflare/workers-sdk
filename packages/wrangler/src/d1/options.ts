import { d1BetaWarning } from "./utils";
import type { CommonYargsOptions } from "../yargs-types";
import type { Argv } from "yargs";

export function Name(yargs: Argv<CommonYargsOptions>) {
	return yargs
		.positional("name", {
			describe: "The name or binding of the DB",
			type: "string",
			demandOption: true,
		})
		.epilogue(d1BetaWarning);
}

export function Database(yargs: Argv<CommonYargsOptions>) {
	return yargs
		.positional("database", {
			describe: "The name or binding of the DB",
			type: "string",
			demandOption: true,
		})
		.epilogue(d1BetaWarning);
}
