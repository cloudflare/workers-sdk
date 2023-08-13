import { options as addOptions, handler as addHandler } from "./add";
import { options as removeOptions, handler as removeHandler } from "./remove";
import type { CommonYargsArgv } from "../../../../yargs-types";

export function consumers(yargs: CommonYargsArgv) {
	yargs.command(
		"add <queue-name> <script-name>",
		"Add a Queue Consumer",
		addOptions,
		addHandler
	);

	yargs.command(
		"remove <queue-name> <script-name>",
		"Remove a Queue Consumer",
		removeOptions,
		removeHandler
	);
}
