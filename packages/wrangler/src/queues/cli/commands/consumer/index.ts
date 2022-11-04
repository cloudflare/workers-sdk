import { type BuilderCallback } from "yargs";
import { options as addOptions, handler as addHandler } from "./add";
import { options as removeOptions, handler as removeHandler } from "./remove";

export const consumers: BuilderCallback<unknown, unknown> = (yargs) => {
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
};
