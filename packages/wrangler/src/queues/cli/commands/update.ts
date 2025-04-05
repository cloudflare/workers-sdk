import { readConfig } from "../../../config";
import { CommandLineArgsError } from "../../../errors";
import { logger } from "../../../logger";
import { getQueue, updateQueue } from "../../client";
import {
	MAX_DELIVERY_DELAY_SECS,
	MAX_MESSAGE_RETENTION_PERIOD_SECS,
	MIN_DELIVERY_DELAY_SECS,
	MIN_MESSAGE_RETENTION_PERIOD_SECS,
} from "../../constants";
import { handleFetchError } from "../../utils";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../../yargs-types";
import type { PostQueueBody, QueueSettings } from "../../client";

export function options(yargs: CommonYargsArgv) {
	return yargs
		.positional("name", {
			type: "string",
			demandOption: true,
			description: "The name of the queue",
		})
		.options({
			"delivery-delay-secs": {
				type: "number",
				describe:
					"How long a published message should be delayed for, in seconds. Must be between 0 and 42300",
			},
			"message-retention-period-secs": {
				type: "number",
				describe:
					"How long to retain a message in the queue, in seconds. Must be between 60 and 1209600",
			},
		});
}

function updateBody(
	args: StrictYargsOptionsToInterface<typeof options>,
	currentSettings?: QueueSettings
): PostQueueBody {
	const body: PostQueueBody = {
		queue_name: args.name,
	};

	if (Array.isArray(args.deliveryDelaySecs)) {
		throw new CommandLineArgsError(
			"Cannot specify --delivery-delay-secs multiple times"
		);
	}

	if (Array.isArray(args.messageRetentionPeriodSecs)) {
		throw new CommandLineArgsError(
			"Cannot specify --message-retention-period-secs multiple times"
		);
	}

	body.settings = {};

	if (args.deliveryDelaySecs != undefined) {
		if (
			args.deliveryDelaySecs < MIN_DELIVERY_DELAY_SECS ||
			args.deliveryDelaySecs > MAX_DELIVERY_DELAY_SECS
		) {
			throw new CommandLineArgsError(
				`Invalid --delivery-delay-secs value: ${args.deliveryDelaySecs}. Must be between ${MIN_DELIVERY_DELAY_SECS} and ${MAX_DELIVERY_DELAY_SECS}`
			);
		}
		body.settings.delivery_delay = args.deliveryDelaySecs;
	} else if (currentSettings?.delivery_delay != undefined) {
		body.settings.delivery_delay = currentSettings.delivery_delay;
	}

	if (args.messageRetentionPeriodSecs != undefined) {
		if (
			args.messageRetentionPeriodSecs < MIN_MESSAGE_RETENTION_PERIOD_SECS ||
			args.messageRetentionPeriodSecs > MAX_MESSAGE_RETENTION_PERIOD_SECS
		) {
			throw new CommandLineArgsError(
				`Invalid --message-retention-period-secs value: ${args.messageRetentionPeriodSecs}. Must be between ${MIN_MESSAGE_RETENTION_PERIOD_SECS} and ${MAX_MESSAGE_RETENTION_PERIOD_SECS}`
			);
		}
		body.settings.message_retention_period = args.messageRetentionPeriodSecs;
	} else if (currentSettings?.message_retention_period != undefined) {
		body.settings.message_retention_period =
			currentSettings.message_retention_period;
	}

	if (Object.keys(body.settings).length === 0) {
		body.settings = undefined;
	}

	return body;
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args);
	try {
		const currentQueue = await getQueue(config, args.name);
		const body = updateBody(args, currentQueue.settings);
		logger.log(`Updating queue ${args.name}.`);
		await updateQueue(config, body, currentQueue.queue_id);
		logger.log(`Updated queue ${args.name}.`);
	} catch (e) {
		handleFetchError(e as { code?: number });
	}
}
