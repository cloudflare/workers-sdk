import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import { getQueue } from "../../client";
import type { Consumer, Producer, QueueResponse } from "../../client";

export const queuesInfoCommand = createCommand({
	metadata: {
		description: "Get queue information",
		owner: "Product: Queues",
		status: "stable",
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the queue",
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		const queue: QueueResponse = await getQueue(config, args.name);
		const accountId = await requireAuth(config);

		logger.log(`Queue Name: ${queue.queue_name}`);
		logger.log(`Queue ID: ${queue.queue_id}`);
		logger.log(`Created On: ${queue.created_on}`);
		logger.log(`Last Modified: ${queue.modified_on}`);
		logger.log(`Number of Producers: ${queue.producers_total_count}`);
		if (queue.producers_total_count > 0) {
			logger.log(
				`Producers:${queue.producers.map((p: Producer) => (p.type === "r2_bucket" ? ` ${p.type}:${p.bucket_name}` : ` ${p.type}:${p.script}`)).toString()}`
			);
		}
		logger.log(`Number of Consumers: ${queue.consumers_total_count}`);
		if (queue.consumers_total_count > 0) {
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
	},
});
