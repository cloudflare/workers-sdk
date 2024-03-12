import { handler as addHandler, options as addOptions } from "./add";
import { handler as removeHandler, options as removeOptions } from "./remove";
import type { CommonYargsArgv } from "../../../../yargs-types";

export function consumers(yargs: CommonYargsArgv) {
	yargs.command(
		"add <queue-name> <script-name>",
		"🔹Add a Queue consumer",
		addOptions,
		addHandler
	);

	yargs.command(
		"remove <queue-name> <script-name>",
		"🔹Remove a Queue consumer",
		removeOptions,
		removeHandler
	);
}
