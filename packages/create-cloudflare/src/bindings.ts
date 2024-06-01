import { inputPrompt } from "@cloudflare/cli/interactive";
import TOML from "@iarna/toml";
import { readWranglerToml, writeWranglerToml } from "./wrangler/config";
import { createQueue, fetchQueues } from "./wrangler/queues";
import type { Arg } from "@cloudflare/cli/interactive";
import type { C3Context } from "types";

export type BindingInfo = {
	boundVariable: string;
	defaultValue: string;
};

export type QueueBindingInfo = BindingInfo & {
	producer: boolean;
	consumer: boolean;
};

export const validateQueueName = (value: Arg) => {
	const invalidChars = /[^a-z0-9-]/;
	const invalidStartEnd = /^-|-$/;

	const name = String(value);
	if (name.match(invalidStartEnd)) {
		return `Queue names cannot start or end with a dash.`;
	}

	if (name.match(invalidChars)) {
		return `Queue names must only contain lowercase characters, numbers, and dashes.`;
	}

	if (name.length > 63) {
		return `Queue name must be less than 64 characters`;
	}
};

export const autoProvisionResources = async (ctx: C3Context) => {
	const wranglerToml = readWranglerToml(ctx);
	const config = TOML.parse(wranglerToml);

	const queuesConfig = config.queues as {
		consumers: { queue: string }[];
		producers: { queue: string; binding: string }[];
	};

	if (queuesConfig) {
		for (const queueConfig of queuesConfig.consumers) {
			const defaultName = queueConfig.queue;
			const queueName = await selectQueue(ctx, defaultName);

			queueConfig.queue = queueName;
		}

		for (const queueConfig of queuesConfig.producers) {
			const defaultName = queueConfig.queue;
			const queueName = await selectQueue(
				ctx,
				defaultName,
				queueConfig.binding,
			);

			queueConfig.queue = queueName;
		}
	}

	// write the mutated config back to disk
	const updatedWranglerToml = TOML.stringify(config);
	writeWranglerToml(ctx, updatedWranglerToml);

	process.exit(1);
};

const selectQueue = async (
	ctx: C3Context,
	defaultValue: string,
	binding?: string,
) => {
	const queues = await fetchQueues(ctx);
	if (queues.length > 0) {
		const queueOptions = [
			{ label: "Create a new queue", value: "--create" },
			...queues.map((q) => ({ label: q.name, value: q.name })),
		];

		const selectedQueue = await inputPrompt({
			type: "select",
			question: binding
				? `Select a queue to send messages to`
				: `Select a queue to consume messages from`,
			options: queueOptions,
			label: "queue",
		});

		if (selectedQueue !== "--create") {
			return selectedQueue;
		}
	}

	const newQueueName = await inputPrompt({
		type: "text",
		question: `What would you like to name your queue?`,
		defaultValue,
		validate: validateQueueName,
		label: "name",
	});
	await createQueue(ctx, newQueueName);
	return newQueueName;
};
