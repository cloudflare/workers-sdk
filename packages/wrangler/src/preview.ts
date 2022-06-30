import { DeprecationError } from "./errors";
import type { Argv } from "yargs";

export function previewOptions(yargs: Argv) {
	return yargs
		.positional("method", {
			type: "string",
			describe: "Type of request to preview your worker",
		})
		.positional("body", {
			type: "string",
			describe: "Body string to post to your preview worker request.",
		})
		.option("env", {
			type: "string",
			requiresArg: true,
			describe: "Perform on a specific environment",
		})
		.option("watch", {
			default: true,
			describe: "Enable live preview",
			type: "boolean",
		});
}

export function previewHandler() {
	throw new DeprecationError(
		"The `wrangler preview` command has been deprecated.\n" +
			"Try using `wrangler dev` to to try out a worker during development.\n"
	);
}
