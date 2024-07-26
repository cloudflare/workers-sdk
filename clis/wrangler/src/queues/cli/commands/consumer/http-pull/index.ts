import {
	handler as addHTTPConsumerHandler,
	options as addOptions,
} from "./add";
import {
	handler as removeHTTPConsumerHandler,
	options as removeOptions,
} from "./remove";
import type { CommonYargsArgv } from "../../../../../yargs-types";

export function pullConsumers(yargs: CommonYargsArgv) {
	yargs.command(
		"add <queue-name>",
		"Add a Queue HTTP Pull Consumer",
		addOptions,
		addHTTPConsumerHandler
	);

	yargs.command(
		"remove <queue-name>",
		"Remove a Queue HTTP Pull Consumer",
		removeOptions,
		removeHTTPConsumerHandler
	);
}
