import { readConfig } from "../../../config";
import { logger } from "../../../logger";
import { getQueue } from "../../client";
import type { QueueResponse, Consumer, Producer } from "../../client"
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../../yargs-types";
import { printWranglerBanner } from "../../../update-check";

export function options(yargs: CommonYargsArgv) {
	return yargs.positional("name", {
        type: "string",
        demandOption: true,
        description: "The name of the queue"
    });
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
    const config = readConfig(args.config, args);
	const queue: QueueResponse = await getQueue(config, args.name);

    await printWranglerBanner()
    logger.log(`Queue Name: ${queue.queue_name}`)
    logger.log(`Queue ID: ${queue.queue_id}`)
    logger.log(`Created On: ${queue.created_on}`)
    logger.log(`Last Modified: ${queue.modified_on}`)
    logger.log(`Number of Producers: ${queue.producers_total_count}`)
    logger.log(`Producers:${queue.producers.map((p: Producer) => p.type === "r2_bucket" ? ` ${p.type}:${p.bucket_name}` : ` ${p.type}:${p.script}` ).toString()}`)
    logger.log(`Number of Consumers: ${queue.consumers_total_count}`)
    logger.log(`Consumers: ${queue.consumers.map((c: Consumer) => {
                         return c.type === "worker" || c.type === "r2_bucket" ? `Consumer: ${c.type}:${c.script}` : `HTTP Pull Consumer \ncurl "https://api.cloudflare.com/client/v4/accounts/${config.account_id}/queues/${queue.queue_id}/messages/pull" \
                                         \n\t--header "Authorization: Bearer <api key>" \
                                         \n\t--header "Content-Type: application/json" \
                                         \n\t--data '{ "visibility_timeout": 10000, "batch_size": 2 }'`}).toString()}`)

}
