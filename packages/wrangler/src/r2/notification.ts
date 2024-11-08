import { readConfig } from "../config";
import { defineAlias, defineCommand, defineNamespace } from "../core";
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

defineNamespace({
	command: "wrangler r2 bucket notification",
	metadata: {
		description: "Manage event notification rules for an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
});

defineAlias({
	command: "wrangler r2 bucket notification get",
	aliasOf: "wrangler r2 bucket notification list",
});

defineCommand({
	command: "wrangler r2 bucket notification list",
	metadata: {
		description: "List event notification rules for an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe: "The name of the R2 bucket to get event notification rules for",
			type: "string",
			demandOption: true,
		},
		jurisdiction: {
			describe: "The jurisdiction where the bucket exists",
			alias: "J",
			requiresArg: true,
			type: "string",
		},
	},
	async handler(args, { config }) {
		await printWranglerBanner();
		// Check for deprecated `wrangler pages publish` command
		if (args._[3] === "get") {
			logger.warn(
				"`wrangler r2 bucket notification get` is deprecated and will be removed in an upcoming release.\nPlease use `wrangler r2 bucket notification list` instead."
			);
		}
		const accountId = await requireAuth(config);
		const apiCreds = requireApiToken();
		const { bucket, jurisdiction = "" } = args;
		const resp = await listEventNotificationConfig(
			apiCreds,
			accountId,
			bucket,
			jurisdiction
		);
		const tableOutput = tableFromNotificationGetResponse(resp);
		logger.log(tableOutput.map((x) => formatLabelledValues(x)).join("\n\n"));
	},
});

defineCommand({
	command: "wrangler r2 bucket notification create",
	metadata: {
		description: "Create an event notification rule for an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe:
				"The name of the R2 bucket to create an event notification rule for",
			type: "string",
			demandOption: true,
		},
		"event-types": {
			describe: "The type of event(s) that will emit event notifications",
			alias: "event-type",
			choices: Object.keys(actionsForEventCategories),
			demandOption: true,
			requiresArg: true,
			array: true,
		},
		prefix: {
			describe:
				"The prefix that an object must match to emit event notifications (note: regular expressions not supported)",
			requiresArg: false,
			type: "string",
		},
		suffix: {
			describe:
				"The suffix that an object must match to emit event notifications (note: regular expressions not supported)",
			type: "string",
		},
		queue: {
			describe:
				"The name of the queue that will receive event notification messages",
			demandOption: true,
			requiresArg: true,
			type: "string",
		},
		jurisdiction: {
			describe: "The jurisdiction where the bucket exists",
			alias: "J",
			requiresArg: true,
			type: "string",
		},
		description: {
			describe:
				"A description that can be used to identify the event notification rule after creation",
			type: "string",
		},
	},
	async handler(args, { config }) {
		await printWranglerBanner();
		const accountId = await requireAuth(config);
		const apiCreds = requireApiToken();
		const {
			bucket,
			queue,
			eventTypes,
			prefix = "",
			suffix = "",
			jurisdiction = "",
			description,
		} = args;
		await putEventNotificationConfig(
			config,
			apiCreds,
			accountId,
			bucket,
			jurisdiction,
			queue,
			eventTypes as R2EventType[],
			prefix,
			suffix,
			description
		);
		logger.log("Event notification rule created successfully!");
	},
});

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
		})
		.option("jurisdiction", {
			describe: "The jurisdiction where the bucket exists",
			alias: "J",
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
	const { bucket, queue, rule, jurisdiction = "" } = args;
	await deleteEventNotificationConfig(
		config,
		apiCreds,
		accountId,
		bucket,
		jurisdiction,
		queue,
		rule
	);
	logger.log("Event notification rule deleted successfully!");
}
