import { readConfig } from "../config";
import { defineCommand, defineNamespace } from "../core";
import { logger } from "../logger";
import { getQueueById } from "../queues/client";
import { requireApiToken, requireAuth } from "../user";
import {
	actionsForEventCategories,
	deleteEventNotificationConfig,
	getEventNotificationConfig,
	putEventNotificationConfig,
	tableFromNotificationGetResponse,
} from "./helpers";
import type { R2EventType } from "./helpers";

defineNamespace({
	command: "wrangler r2 bucket notification",

	metadata: {
		description: "Manage event notifications for an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
});

defineCommand({
	command: "wrangler r2 bucket notification get",

	metadata: {
		description: "Get event notification configuration for a bucket",
		status: "stable",
		owner: "Product: R2",
	},

	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe:
				"The name of the bucket for which notifications will be emitted",
			type: "string",
			demandOption: true,
		},
	},

	async handler(args) {
		const config = readConfig(args.config, args);
		const accountId = await requireAuth(config);
		const apiCreds = requireApiToken();
		const resp = await getEventNotificationConfig(
			apiCreds,
			accountId,
			`${args.bucket}`
		);
		const tableOutput = await tableFromNotificationGetResponse(
			config,
			resp[args.bucket],
			getQueueById
		);
		logger.table(tableOutput);
	},
});

defineCommand({
	command: "wrangler r2 bucket notification create",

	metadata: {
		description: "Create new event notification configuration for an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},

	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe:
				"The name of the bucket for which notifications will be emitted",
			type: "string",
			demandOption: true,
		},
		"event-types": {
			describe:
				"Specify the kinds of object events to emit notifications for. ex. '--event-types object-create object-delete'",
			alias: "event-type",
			choices: Object.keys(actionsForEventCategories),
			demandOption: true,
			requiresArg: true,
			type: "string",
			array: true,
		},
		prefix: {
			describe:
				"only actions on objects with this prefix will emit notifications",
			requiresArg: false,
			type: "string",
		},
		suffix: {
			describe:
				"only actions on objects with this suffix will emit notifications",
			type: "string",
		},
		queue: {
			describe:
				"The name of the queue to which event notifications will be sent. ex '--queue my-queue'",
			demandOption: true,
			requiresArg: true,
			type: "string",
		},
	},

	async handler(args) {
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
	},
});

defineCommand({
	command: "wrangler r2 bucket notification delete",

	metadata: {
		description:
			"Delete event notification configuration for an R2 bucket and queue",
		status: "stable",
		owner: "Product: R2",
	},

	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe:
				"The name of the bucket for which notifications will be emitted",
			type: "string",
			demandOption: true,
		},
		queue: {
			describe:
				"The name of the queue that is configured to receive notifications. ex '--queue my-queue'",
			demandOption: true,
			requiresArg: true,
			type: "string",
		},
	},

	async handler(args) {
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
	},
});
