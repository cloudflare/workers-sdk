import { warn } from "console";
import { inputPrompt } from "@cloudflare/cli/interactive";
import { readWranglerConfig, writeWranglerConfig } from "./wrangler/config";
import { createKvNamespace, fetchKvNamespaces } from "./wrangler/kvNamespaces";
import { createQueue, fetchQueues } from "./wrangler/queues";
import { createR2Bucket, fetchR2Buckets } from "./wrangler/r2Buckets";
import type { KvNamespace } from "./wrangler/kvNamespaces";
import type { Queue } from "./wrangler/queues";
import type { R2Bucket } from "./wrangler/r2Buckets";
import type { WranglerConfig } from "./wrangler/schema";
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
	const wranglerConfig = readWranglerConfig(ctx);
	if (!wranglerConfig) {
		warn(
			"Skipping resource provisioning. Please check `wrangler.toml` and create any required resource bindings before deployment.",
		);
		return false;
	}

	await provisionQueues(ctx, wranglerConfig);
	await provisionKvNamespaces(ctx, wranglerConfig);
	await provisionR2Buckets(ctx, wranglerConfig);

	// write the mutated config back to disk
	writeWranglerConfig(ctx, wranglerConfig);
	console.log(ctx.project.name);
	process.exit(1);
	return true;
};

const provisionQueues = async (
	ctx: C3Context,
	wranglerConfig: WranglerConfig,
) => {
	if (!wranglerConfig.queues) {
		return;
	}
	for (const queueConfig of wranglerConfig.queues.consumers) {
		const queueName = await selectOrCreateResource<Queue>({
			ctx,
			fetchResources: fetchQueues,
			createResource: createQueue,
			toOptions: (q) => ({ label: q.name, value: q.name }),
			createLabel: "Create a new queue",
			placeholder: queueConfig.queue,
			selectQuestion: `Select a queue to consume messages from`,
			createQuestion: `What would you like to name your queue?`,
		});

		queueConfig.queue = queueName;
	}

	for (const queueConfig of wranglerConfig.queues.producers) {
		const queueName = await selectOrCreateResource<Queue>({
			ctx,
			fetchResources: fetchQueues,
			createResource: createQueue,
			toOptions: (q) => ({ label: q.name, value: q.name }),
			createLabel: "Create a new queue",
			placeholder: queueConfig.queue,
			selectQuestion: `Select a queue to send messages to`,
			createQuestion: `What would you like to name your queue?`,
		});

		queueConfig.queue = queueName;
	}
};

const provisionKvNamespaces = async (
	ctx: C3Context,
	wranglerConfig: WranglerConfig,
) => {
	if (!wranglerConfig.kv_namespaces) {
		return;
	}

	for (const kvNamespace of wranglerConfig.kv_namespaces) {
		const namespaceId = await selectOrCreateResource<KvNamespace>({
			ctx,
			fetchResources: fetchKvNamespaces,
			createResource: createKvNamespace,
			toOptions: (ns) => ({ label: ns.title, value: ns.id }),
			createLabel: "Create a new KV namespace",
			placeholder: kvNamespace.id,
			selectQuestion: `Which KV namespace should be bound to \`${kvNamespace.binding}\`?`,
			createQuestion: `What would you like to name your KV namespace?`,
		});

		kvNamespace.id = namespaceId;
	}
};

const provisionR2Buckets = async (
	ctx: C3Context,
	wranglerConfig: WranglerConfig,
) => {
	if (!wranglerConfig.r2_buckets) {
		return;
	}

	for (const bucket of wranglerConfig.r2_buckets) {
		const bucketName = await selectOrCreateResource<R2Bucket>({
			ctx,
			fetchResources: fetchR2Buckets,
			createResource: createR2Bucket,
			toOptions: ({ name }) => ({ label: name, value: name }),
			createLabel: "Create a new R2 bucket",
			placeholder: bucket.bucket_name,
			selectQuestion: `Which R2 bucket should be bound to \`${bucket.binding}\`?`,
			createQuestion: `What would you like to name your R2 bucket?`,
		});

		bucket.bucket_name = bucketName;
	}
};

type SelectOrCreateOptions<T> = {
	ctx: C3Context;
	fetchResources: (ctx: C3Context) => Promise<T[]>;
	toOptions: (item: T) => { label: string; value: string };
	createLabel: string;
	placeholder: string;
	selectQuestion: string;
	createQuestion: string;
	createResource: (ctx: C3Context, id: string) => Promise<string>;
};

const selectOrCreateResource = async <T>({
	ctx,
	fetchResources,
	toOptions,
	createLabel,
	placeholder,
	selectQuestion,
	createQuestion,
	createResource,
}: SelectOrCreateOptions<T>) => {
	const availableResources = await fetchResources(ctx);

	if (availableResources.length > 0) {
		const options = [
			{ label: createLabel, value: "--create" },
			...availableResources.map(toOptions),
		];

		const selectedNs = await inputPrompt({
			type: "select",
			question: selectQuestion,
			options: options,
			label: "namespace",
		});

		if (selectedNs !== "--create") {
			return selectedNs;
		}
	}

	const newResourceName = await inputPrompt({
		type: "text",
		question: createQuestion,
		defaultValue: placeholder,
		validate: validateQueueName,
		label: "name",
	});

	// return createKvNamespace(ctx, newNamespaceName);
	return createResource(ctx, newResourceName);
};
