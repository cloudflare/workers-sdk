import { type BuilderCallback } from "yargs";

import * as Create from "./create";
import * as Delete from "./delete";
import * as List from "./list";

export const queues: BuilderCallback<unknown, unknown> = (yargs) => {
	yargs.command("list", "List Queues", List.Options, List.Handler);

	yargs.command(
		"create <name>",
		"Create a Queue",
		Create.Options,
		Create.Handler
	);

	yargs.command(
		"delete <name>",
		"Delete a Queue",
		Delete.Options,
		Delete.Handler
	);
};
