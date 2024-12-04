import { HandleUnauthorizedError } from "../../utils";
import { consumers } from "./consumer/index";
import { handler as createHandler, options as createOptions } from "./create";
import { handler as deleteHandler, options as deleteOptions } from "./delete";
import { handler as infoHandler, options as infoOptions } from "./info";
import { handler as listHandler, options as listOptions } from "./list";
import type { CommonYargsArgv } from "../../../yargs-types";

export function queues(yargs: CommonYargsArgv) {
	yargs.command("list", "List Queues", listOptions, listHandler);

	yargs.command(
		"create <name>",
		"Create a Queue",
		createOptions,
		createHandler
	);

	yargs.command(
		"delete <name>",
		"Delete a Queue",
		deleteOptions,
		deleteHandler
	);

	yargs.command(
		"info <name>",
		"Get Queue information",
		infoOptions,
		infoHandler
	);

	yargs.command(
		"consumer",
		"Configure Queue consumers",
		async (consumersYargs) => {
			await consumers(consumersYargs);
		}
	);

	yargs.fail(HandleUnauthorizedError);
}
