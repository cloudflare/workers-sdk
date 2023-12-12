import { crash } from "@cloudflare/cli";
import { inputPrompt } from "@cloudflare/cli/interactive";
import { createQueue, fetchQueues } from "helpers/wrangler";
import { validateQueueName } from "./validators";
import { appendToWranglerToml } from "./workers";
import type { QueueBindingInfo } from "./templateMap";
import type { C3Context } from "types";

export const bindResources = async (ctx: C3Context) => {
	if (!ctx.account?.id) {
		crash("Failed to read Cloudflare account.");
		return;
	}

	if (ctx.args.deploy === false) {
		return;
	}

	const bindingsConfig = ctx.template.bindings;
	if (!bindingsConfig) {
		return;
	}

	const { queues } = bindingsConfig;
	for (const queue of queues) {
		await bindQueue(ctx, queue);
	}
};

const bindQueue = async (
	ctx: C3Context,
	bindingDefinition: QueueBindingInfo
) => {
	const { boundVariable, defaultValue, producer, consumer } = bindingDefinition;

	const queues = await fetchQueues(ctx);
	if (queues.length > 0) {
		const queueOptions = [
			{ label: "Create a new queue", value: "--create" },
			...queues.map((q) => ({ label: q.queue_name, value: q.queue_name })),
		];

		const selectedQueue = await inputPrompt({
			type: "select",
			question: `Which queue should be bound to \`${boundVariable}\`?`,
			options: queueOptions,
			label: "queue",
		});

		if (selectedQueue !== "--create") {
			if (producer) {
				await addProducerBinding(ctx, boundVariable, selectedQueue);
			}
			if (consumer) {
				await addConsumerBinding(ctx, selectedQueue);
			}
			return;
		}
	}

	const newQueueName = await inputPrompt({
		type: "text",
		question: `What would you like to name your queue?`,
		defaultValue,
		validate: validateQueueName,
		label: "queue",
	});

	await createQueue(ctx, newQueueName);
	if (producer) {
		await addProducerBinding(ctx, boundVariable, newQueueName);
	}
	if (consumer) {
		await addConsumerBinding(ctx, newQueueName);
	}
};

const addProducerBinding = async (
	ctx: C3Context,
	binding: string,
	queue: string
) => {
	await appendToWranglerToml(
		ctx,
		`
[[queues.producers]]
binding = "${binding}"
queue = "${queue}"
`
	);
};

const addConsumerBinding = async (ctx: C3Context, queue: string) => {
	await appendToWranglerToml(
		ctx,
		`
[[queues.consumers]]
queue = "${queue}"
`
	);
};
