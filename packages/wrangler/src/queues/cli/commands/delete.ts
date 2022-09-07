import { type Argv } from "yargs";
import { logger } from "../../../logger";
import * as Client from "../../client";
import * as Config from "../config";

interface Args extends Config.Args {
	name: string;
}

export function Options(yargs: Argv): Argv<Args> {
	// TODO(soon) --force option
	return yargs.positional("name", {
		type: "string",
		demandOption: true,
		description: "The name of the queue",
	});
}

export async function Handler(args: Args) {
	const config = Config.read(args);

	logger.log(`Deleting queue ${args.name}.`);
	await Client.DeleteQueue(config, args.name);
	logger.log(`Deleted queue ${args.name}.`);
}
