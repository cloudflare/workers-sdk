import { readConfig } from "../../../config";
import { logger } from "../../../logger";
import { listQueues } from "../../client";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../../yargs-types";

export function options(yargs: CommonYargsArgv) {
	return yargs.options({
		page: {
			type: "number",
			describe: "Page number for pagination",
		},
	});
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args.config, args);

	const queues = await listQueues(config, args.page);
	logger.log(JSON.stringify(queues));
}
