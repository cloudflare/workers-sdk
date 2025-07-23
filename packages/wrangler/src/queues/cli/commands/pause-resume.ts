import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { getQueue, updateQueue } from "../../client";
import { handleFetchError } from "../../utils";
import type { Config } from "../../../config";
import type { PostQueueBody } from "../../client";

export const queuesPauseCommand = createCommand({
	metadata: {
		description: "Pause message delivery for a queue",
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
		await toggleDeliveryPaused(args, config, true);
	},
});

export const queuesResumeCommand = createCommand({
	metadata: {
		description: "Resume message delivery for a queue",
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
		await toggleDeliveryPaused(args, config, false);
	},
});

async function toggleDeliveryPaused(
	args: typeof queuesPauseCommand.args | typeof queuesResumeCommand.args,
	config: Config,
	paused: boolean
) {
	const body: PostQueueBody = {
		queue_name: args.name,
		settings: {
			delivery_paused: paused,
		},
	};
	try {
		const currentQueue = await getQueue(config, args.name);

		let msg = paused ? "Pausing" : "Resuming";
		logger.log(`${msg} message delivery for queue ${args.name}.`);

		await updateQueue(config, body, currentQueue.queue_id);

		msg = paused ? "Paused" : "Resumed";
		logger.log(`${msg} message delivery for queue ${args.name}.`);
	} catch (e) {
		handleFetchError(e as { code?: number });
	}
}
