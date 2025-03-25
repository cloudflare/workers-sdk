import { readConfig } from "../../../config";
import { logger } from "../../../logger";
import { getQueue, updateQueue } from "../../client";
import { handleFetchError } from "../../utils";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../../yargs-types";
import type { PostQueueBody } from "../../client";

export function options(yargs: CommonYargsArgv) {
	return yargs.positional("name", {
		type: "string",
		demandOption: true,
		description: "The name of the queue",
	});
}

export async function pauseHandler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	return toggleDeliveryPaused(args, true);
}

export async function resumeHandler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	return toggleDeliveryPaused(args, false);
}

async function toggleDeliveryPaused(
	args: StrictYargsOptionsToInterface<typeof options>,
	paused: boolean
) {
	const config = readConfig(args);
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
