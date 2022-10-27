import { type Argv } from "yargs";
import { logger } from "../../../../logger";
import * as Client from "../../../client";
import * as Config from "../../config";

interface Args extends Config.Args {
	["queue-name"]: string;
	["script-name"]: string;
	["environment"]: string | undefined;
}

export function Options(yargs: Argv): Argv<Args> {
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

export async function Handler(args: Args) {
	const config = Config.read(args);

	logger.log(`Removing consumer from queue ${args["queue-name"]}.`);
	await Client.DeleteConsumer(
		config,
		args["queue-name"],
		args["script-name"],
		args["environment"]
	);
	logger.log(`Removed consumer from queue ${args["queue-name"]}.`);
}
