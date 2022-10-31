import { type Argv } from "yargs";
import { readConfig } from "../../../../config";
import { logger } from "../../../../logger";
import { deleteConsumer } from "../../../client";

interface Args {
	config?: string;
	["queue-name"]: string;
	["script-name"]: string;
	["environment"]: string | undefined;
}

export function options(yargs: Argv): Argv<Args> {
	return yargs
		.positional("queue-name", {
			type: "string",
			demandOption: true,
			description: "Name of the queue to configure",
		})
		.positional("script-name", {
			type: "string",
			demandOption: true,
			description: "Name of the consumer script",
		})
		.options({
			environment: {
				type: "string",
				describe: "Environment of the consumer script",
			},
		});
}

export async function handler(args: Args) {
	const config = readConfig(args.config, args);

	logger.log(`Removing consumer from queue ${args["queue-name"]}.`);
	await deleteConsumer(
		config,
		args["queue-name"],
		args["script-name"],
		args["environment"]
	);
	logger.log(`Removed consumer from queue ${args["queue-name"]}.`);
}
