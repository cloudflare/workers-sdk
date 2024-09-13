import { readConfig } from "../config";
import { logger } from "../logger";
import { printWranglerBanner } from "../update-check";
import { requireApiToken, requireAuth } from "../user";
import formatLabelledValues from "../utils/render-labelled-values";
import {
	actionsForEventCategories,
	deleteEventNotificationConfig,
	getEventNotificationConfig,
	putEventNotificationConfig,
	tableFromNotificationGetResponse,
} from "./helpers";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { R2EventType } from "./helpers";

export function GetOptions(yargs: CommonYargsArgv) {
	return yargs.positional("bucket", {
		describe: "The name of the bucket for which notifications will be emitted",
		type: "string",
		demandOption: true,
	});
}

export async function GetHandler(
	args: StrictYargsOptionsToInterface<typeof GetOptions>
) {
	await printWranglerBanner();
	const config = readConfig(args.config, args);
	const accountId = await requireAuth(config);
	const apiCreds = requireApiToken();
	const resp = await getEventNotificationConfig(
		apiCreds,
		accountId,
		`${args.bucket}`
	);
	const tableOutput = await tableFromNotificationGetResponse(config, resp);
	logger.log(tableOutput.map((x) => formatLabelledValues(x)).join("\n\n"));
}

export function CreateOptions(yargs: CommonYargsArgv) {
	return yargs
		.positional("bucket", {
			describe:
				"The name of the bucket for which notifications will be emitted",
			type: "string",
			demandOption: true,
		})
		.option("event-types", {
			describe:
				"Specify the kinds of object events to emit notifications for. ex. '--event-types object-create object-delete'",
			alias: "event-type",
			choices: Object.keys(actionsForEventCategories),
			demandOption: true,
			requiresArg: true,
			type: "array",
		})
		.option("prefix", {
			describe:
				"only actions on objects with this prefix will emit notifications",
			requiresArg: false,
			type: "string",
		})
		.option("suffix", {
			describe:
				"only actions on objects with this suffix will emit notifications",
			type: "string",
		})
		.option("queue", {
			describe:
				"The name of the queue to which event notifications will be sent. ex '--queue my-queue'",
			demandOption: true,
			requiresArg: true,
			type: "string",
		});
}

export async function CreateHandler(
	args: StrictYargsOptionsToInterface<typeof CreateOptions>
) {
	await printWranglerBanner();
	const config = readConfig(args.config, args);
	const accountId = await requireAuth(config);
	const apiCreds = requireApiToken();
	const { bucket, queue, eventTypes, prefix = "", suffix = "" } = args;
	await putEventNotificationConfig(
		config,
		apiCreds,
		accountId,
		`${bucket}`,
		`${queue}`,
		eventTypes as R2EventType[],
		`${prefix}`,
		`${suffix}`
	);
	logger.log("Configuration created successfully!");
}

export function DeleteOptions(yargs: CommonYargsArgv) {
	return yargs
		.positional("bucket", {
			describe:
				"The name of the bucket for which notifications will be emitted",
			type: "string",
			demandOption: true,
		})
		.option("queue", {
			describe:
				"The name of the queue that is configured to receive notifications. ex '--queue my-queue'",
			demandOption: true,
			requiresArg: true,
			type: "string",
		});
}

export async function DeleteHandler(
	args: StrictYargsOptionsToInterface<typeof DeleteOptions>
) {
	await printWranglerBanner();
	const config = readConfig(args.config, args);
	const accountId = await requireAuth(config);
	const apiCreds = requireApiToken();
	const { bucket, queue } = args;
	await deleteEventNotificationConfig(
		config,
		apiCreds,
		accountId,
		`${bucket}`,
		`${queue}`
	);
	logger.log("Configuration deleted successfully!");
}
