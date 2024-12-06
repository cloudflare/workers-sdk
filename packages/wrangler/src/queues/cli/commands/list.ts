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
	const config = readConfig(args);

	const queues = await listQueues(config, args.page);
	logger.table(
		queues.map((queue) => ({
			id: queue.queue_id,
			name: queue.queue_name,
			created_on: queue.created_on,
			modified_on: queue.modified_on,
			producers: queue.producers_total_count.toString(),
			consumers: queue.consumers_total_count.toString(),
		}))
	);
}
