import { type Argv } from "yargs";
import { logger } from "../../../logger";
import * as Client from "../../client";
import * as Config from "../config";

interface Args extends Config.Args {
	name: string;
}

export function Options(yargs: Argv): Argv<Args> {
	return yargs.positional("name", {
		type: "string",
		demandOption: true,
		description: "The name of the queue",
	});
}

export async function Handler(args: Args) {
	const config = Config.read(args);

	logger.log(`Creating queue ${args.name}.`);
	await Client.CreateQueue(config, { queue_name: args.name });
	logger.log(`Created queue ${args.name}.`);
}
