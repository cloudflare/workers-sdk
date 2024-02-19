import { handler as createHandler, options as createOptions } from "./create";
import { handler as deleteHandler, options as deleteOptions } from "./delete";
import { handler as getHandler, options as getOptions } from "./get";
import { handler as listHandler, options as listOptions } from "./list";
import { handler as updateHandler, options as updateOptions } from "./update";
import { hyperdriveBetaWarning } from "./utils";
import type { CommonYargsArgv } from "../yargs-types";

export function hyperdrive(yargs: CommonYargsArgv) {
	return yargs
		.command(
			"create <name>",
			"Create a Hyperdrive config",
			createOptions,
			createHandler
		)
		.command(
			"delete <id>",
			"Delete a Hyperdrive config",
			deleteOptions,
			deleteHandler
		)
		.command("get <id>", "Get a Hyperdrive config", getOptions, getHandler)
		.command("list", "List Hyperdrive configs", listOptions, listHandler)
		.command(
			"update <id>",
			"Update a Hyperdrive config",
			updateOptions,
			updateHandler
		)
		.epilogue(hyperdriveBetaWarning);
}
