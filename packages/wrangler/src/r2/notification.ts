import { readConfig } from "../config";
import { logger } from "../logger";
import { printWranglerBanner } from "../update-check";
import { requireApiToken, requireAuth } from "../user";
import formatLabelledValues from "../utils/render-labelled-values";
import {
	actionsForEventCategories,
	deleteEventNotificationConfig,
	listEventNotificationConfig,
	putEventNotificationConfig,
	tableFromNotificationGetResponse,
} from "./helpers";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { R2EventType } from "./helpers";

export function ListOptions(yargs: CommonYargsArgv) {
	return yargs.positional("bucket", {
		describe: "The name of the R2 bucket to get event notification rules for",
		type: "string",
		demandOption: true,
	});
}

export async function ListHandler(
	args: StrictYargsOptionsToInterface<typeof ListOptions>
) {
	await printWranglerBanner();
	// Check for deprecated `wrangler pages publish` command
	if (args._[3] === "get") {
		logger.warn(
			"`wrangler r2 bucket notification get` is deprecated and will be removed in an upcoming release.\nPlease use `wrangler r2 bucket notification list` instead."
		);
	}
	const config = readConfig(args.config, args);
	const accountId = await requireAuth(config);
	const apiCreds = requireApiToken();
	const resp = await listEventNotificationConfig(
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
				"The name of the R2 bucket to create an event notification rule for",
			type: "string",
			demandOption: true,
		})
		.option("event-types", {
			describe: "The type of event(s) that will emit event notifications",
			alias: "event-type",
			choices: Object.keys(actionsForEventCategories),
			demandOption: true,
			requiresArg: true,
			type: "array",
		})
		.option("prefix", {
			describe:
				"The prefix that an object must match to emit event notifications (note: regular expressions not supported)",
			requiresArg: false,
			type: "string",
		})
		.option("suffix", {
			describe:
				"The suffix that an object must match to emit event notifications (note: regular expressions not supported)",
			type: "string",
		})
		.option("queue", {
			describe:
				"The name of the queue that will receive event notification messages",
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
		bucket,
		queue,
		eventTypes as R2EventType[],
		prefix,
		suffix
	);
	logger.log("Event notification rule created successfully!");
}

export function DeleteOptions(yargs: CommonYargsArgv) {
	return yargs
		.positional("bucket", {
			describe:
				"The name of the R2 bucket to delete an event notification rule for",
			type: "string",
			demandOption: true,
		})
		.option("queue", {
			describe:
				"The name of the queue that corresponds to the event notification rule. If no rule is provided, all event notification rules associated with the bucket and queue will be deleted",
			demandOption: true,
			requiresArg: true,
			type: "string",
		})
		.option("rule", {
			describe: "The ID of the event notification rule to delete",
			requiresArg: false,
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
	const { bucket, queue, rule } = args;
	await deleteEventNotificationConfig(
		config,
		apiCreds,
		accountId,
		bucket,
		queue,
		rule
	);
	logger.log("Event notification rule deleted successfully!");
}
