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
