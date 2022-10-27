import { type BuilderCallback } from "yargs";
import * as Add from "./add";
import * as Remove from "./remove";

export const consumers: BuilderCallback<unknown, unknown> = (yargs) => {
	yargs.command(
		"add <queue-name> <script-name>",
		"Add a Queue Consumer",
		Add.Options,
		Add.Handler
	);

	yargs.command(
		"remove <queue-name> <script-name>",
		"Remove a Queue Consumer",
		Remove.Options,
		Remove.Handler
	);
};
