import { readConfig } from "../../../config";
import { defineCommand } from "../../../core";
import { CommandLineArgsError } from "../../../index";
import { logger } from "../../../logger";
import { createQueue } from "../../client";
import { handleFetchError, handleUnauthorizedError } from "../../utils";
import type { PostQueueBody } from "../../client";

const command = defineCommand({
	command: "wrangler queues create",

	metadata: {
		description: "Create a Queue",
		status: "stable",
		owner: "Product: Queues",
	},

	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the queue",
		},
		"delivery-delay-secs": {
			type: "number",
			describe:
				"How long a published message should be delayed for, in seconds. Must be a positive integer",
		},
	},
	positionalArgs: ["name"],

	async handler(args) {
		const config = readConfig(args.config, args);
		const body = createBody(args);
		try {
			logger.log(`Creating queue ${args.name}.`);
			await createQueue(config, body);
			logger.log(`Created queue ${args.name}.`);
		} catch (e) {
			handleFetchError(e as { code?: number });
		}
	},

	handleError: handleUnauthorizedError,
});

function createBody(args: typeof command.args): PostQueueBody {
	const body: PostQueueBody = {
		queue_name: args.name,
	};

	if (Array.isArray(args.deliveryDelaySecs)) {
		throw new CommandLineArgsError(
			"Cannot specify --delivery-delay-secs multiple times"
		);
	}

	if (args.deliveryDelaySecs != undefined) {
		body.settings = {
			delivery_delay: args.deliveryDelaySecs,
		};
	}

	return body;
}
