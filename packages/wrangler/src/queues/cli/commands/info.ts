import { readConfig } from "../../../../../wrangler-shared/src/config";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import { printWranglerBanner } from "../../../wrangler-banner";
import { getQueue } from "../../client";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../../yargs-types";
import type { Consumer, Producer, QueueResponse } from "../../client";

export function options(yargs: CommonYargsArgv) {
	return yargs.positional("name", {
		type: "string",
		demandOption: true,
		description: "The name of the queue",
	});
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args);
	const queue: QueueResponse = await getQueue(config, args.name);
	const accountId = await requireAuth(config);

	await printWranglerBanner();
	logger.log(`Queue Name: ${queue.queue_name}`);
	logger.log(`Queue ID: ${queue.queue_id}`);
	logger.log(`Created On: ${queue.created_on}`);
	logger.log(`Last Modified: ${queue.modified_on}`);
	logger.log(`Number of Producers: ${queue.producers_total_count}`);
	queue.producers_total_count > 0 &&
		logger.log(
			`Producers:${queue.producers.map((p: Producer) => (p.type === "r2_bucket" ? ` ${p.type}:${p.bucket_name}` : ` ${p.type}:${p.script}`)).toString()}`
		);
	logger.log(`Number of Consumers: ${queue.consumers_total_count}`);
	queue.consumers_total_count > 0 &&
		logger.log(
			`Consumers: ${queue.consumers
				.map((c: Consumer) => {
					if (c.type === "r2_bucket") {
						return `${c.type}:${c.bucket_name}`;
					}
					if (c.type === "http_pull") {
						return `HTTP Pull Consumer.
Pull messages using:
curl "https://api.cloudflare.com/client/v4/accounts/${accountId || "<add your account id here>"}/queues/${queue.queue_id || "<add your queue id here>"}/messages/pull" \\
	--header "Authorization: Bearer <add your api key here>" \\
	--header "Content-Type: application/json" \\
	--data '{ "visibility_timeout": 10000, "batch_size": 2 }'`;
					}
					return `${c.type}:${c.script}`;
				})
				.toString()}`
		);
}
