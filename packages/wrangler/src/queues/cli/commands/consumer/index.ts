import { pullConsumers } from "./http-pull";
import { workerConsumers } from "./worker";
import { handler as addHandler, options as addOptions } from "./worker/add";
import {
	handler as removeHandler,
	options as removeOptions,
} from "./worker/remove";
import type { CommonYargsArgv } from "../../../../yargs-types";

export function consumers(yargs: CommonYargsArgv) {
	yargs.command(
		"add <queue-name> <script-name>",
		"Add a Queue Worker Consumer",
		addOptions,
		addHandler
	);

	yargs.command(
		"remove <queue-name> <script-name>",
		"Remove a Queue Worker Consumer",
		removeOptions,
		removeHandler
	);

	yargs.command(
		"http",
		"Configure Queue HTTP Pull Consumers",
		async (consumersYargs) => {
			await pullConsumers(consumersYargs);
		}
	);

	yargs.command(
		"worker",
		"Configure Queue Worker Consumers",
		async (consumersYargs) => {
			await workerConsumers(consumersYargs);
		}
	);
}
