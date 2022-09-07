import { type Argv } from "yargs";
import { logger } from "../../../logger";
import * as Client from "../../client";
import * as Config from "../config";

interface Args extends Config.Args {
	page: number | undefined;
}

export function Options(yargs: Argv): Argv<Args> {
	return yargs.options({
		page: {
			type: "number",
			describe: "Page number for pagination",
		},
	});
}

export async function Handler(args: Args) {
	const config = Config.read(args);

	const queues = await Client.ListQueues(config, args.page);
	logger.log(JSON.stringify(queues));
}
