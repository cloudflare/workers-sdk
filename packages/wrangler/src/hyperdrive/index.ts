import { hyperdriveBetaWarning } from "./common";
import { options as createOptions, handler as createHandler } from "./create";
import { options as deleteOptions, handler as deleteHandler } from "./delete";
import { options as getOptions, handler as getHandler } from "./get";
import { options as listOptions, handler as listHandler } from "./list";
import { options as updateOptions, handler as updateHandler } from "./update";
import type { CommonYargsArgv } from "../yargs-types";

export function hyperdrive(yargs: CommonYargsArgv) {
	return yargs
		.command(
			"create <name>",
			"Create a Hyperdrive database configuration",
			createOptions,
			createHandler
		)
		.command(
			"delete <id>",
			"Delete a Hyperdrive database configuration",
			deleteOptions,
			deleteHandler
		)
		.command("get <id>", "Get a Hyperdrive database configuration", getOptions, getHandler)
		.command("list", "List Hyperdrive database configurations", listOptions, listHandler)
		.command(
			"update <id>",
			"Update a Hyperdrive database configuration",
			updateOptions,
			updateHandler
		)
		.epilogue(hyperdriveBetaWarning);
}
