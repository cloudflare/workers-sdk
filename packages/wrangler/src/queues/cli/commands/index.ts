import { HandleUnauthorizedError } from "../../utils";
import { consumers } from "./consumer/index";
import { handler as createHandler, options as createOptions } from "./create";
import { handler as deleteHandler, options as deleteOptions } from "./delete";
import { handler as infoHandler, options as infoOptions } from "./info";
import { handler as listHandler, options as listOptions } from "./list";
import {
	pauseHandler,
	options as pauseResumeOptions,
	resumeHandler,
} from "./pause-resume";
import { handler as purgeHandler, options as purgeOptions } from "./purge";
import { handler as updateHandler, options as updateOptions } from "./update";
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
		"update <name>",
		"Update a Queue",
		updateOptions,
		updateHandler
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

	yargs.command(
		"pause-delivery <name>",
		"Pause message delivery for a Queue",
		pauseResumeOptions,
		pauseHandler
	);

	yargs.command(
		"resume-delivery <name>",
		"Resume message delivery for a Queue",
		pauseResumeOptions,
		resumeHandler
	);

	yargs.command(
		"purge <name>",
		"Purge messages from a Queue",
		purgeOptions,
		purgeHandler
	);

	yargs.fail(HandleUnauthorizedError);
}
