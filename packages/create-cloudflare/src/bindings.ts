import { warn } from "console";
import { inputPrompt } from "@cloudflare/cli/interactive";
import { readWranglerConfig, writeWranglerConfig } from "./wrangler/config";
import { createD1Database, fetchD1Databases } from "./wrangler/d1Databases";
import { createKvNamespace, fetchKvNamespaces } from "./wrangler/kvNamespaces";
import { createQueue, fetchQueues } from "./wrangler/queues";
import { createR2Bucket, fetchR2Buckets } from "./wrangler/r2Buckets";
import {
	createVectorizeIndex,
	fetchVectorizeIndices,
} from "./wrangler/vectorize";
import type { D1Database } from "./wrangler/d1Databases";
import type { KvNamespace } from "./wrangler/kvNamespaces";
import type { Queue } from "./wrangler/queues";
import type { R2Bucket } from "./wrangler/r2Buckets";
import type { WranglerConfig } from "./wrangler/schema";
import type { VectorizeIndex } from "./wrangler/vectorize";
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
	await provisionD1Databases(ctx, wranglerConfig);
	await provisionVariables(ctx, wranglerConfig);
	await provisionVectorizeIndices(ctx, wranglerConfig);

	// write the mutated config back to disk
	writeWranglerConfig(ctx, wranglerConfig);
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
		const queue = await selectOrCreateResource<Queue>({
			ctx,
			fetchResources: fetchQueues,
			createResource: createQueue,
			toOptions: (q) => ({ label: q.name, value: q.name }),
			locate: (q, name) => q.name === name,
			createLabel: "Create a new queue",
			placeholder: queueConfig.queue,
			selectQuestion: `Select a queue to consume messages from`,
			createQuestion: `What would you like to name your queue?`,
		});

		queueConfig.queue = queue.name;
	}

	for (const queueConfig of wranglerConfig.queues.producers) {
		const queue = await selectOrCreateResource<Queue>({
			ctx,
			fetchResources: fetchQueues,
			createResource: createQueue,
			toOptions: (q) => ({ label: q.name, value: q.name }),
			locate: (q, name) => q.name === name,
			createLabel: "Create a new queue",
			placeholder: queueConfig.queue,
			selectQuestion: `Select a queue to send messages to`,
			createQuestion: `What would you like to name your queue?`,
		});

		queueConfig.queue = queue.name;
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
		const namespace = await selectOrCreateResource<KvNamespace>({
			ctx,
			fetchResources: fetchKvNamespaces,
			createResource: createKvNamespace,
			locate: (ns, id) => ns.id === id,
			toOptions: (ns) => ({ label: ns.title ?? ns.id, value: ns.id }),
			createLabel: "Create a new KV namespace",
			placeholder: kvNamespace.id,
			selectQuestion: `Which KV namespace should be bound to \`${kvNamespace.binding}\`?`,
			createQuestion: `What would you like to name your KV namespace?`,
		});

		kvNamespace.id = namespace.id;
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
			locate: (b, name) => b.name === name,
			createLabel: "Create a new R2 bucket",
			placeholder: bucket.bucket_name,
			selectQuestion: `Which R2 bucket should be bound to \`${bucket.binding}\`?`,
			createQuestion: `What would you like to name your R2 bucket?`,
		});

		bucket.bucket_name = bucketName.name;
	}
};

const provisionD1Databases = async (
	ctx: C3Context,
	wranglerConfig: WranglerConfig,
) => {
	if (!wranglerConfig.d1_databases) {
		return;
	}

	for (const d1Database of wranglerConfig.d1_databases) {
		const db = await selectOrCreateResource<D1Database>({
			ctx,
			fetchResources: fetchD1Databases,
			createResource: createD1Database,
			toOptions: ({ name, uuid }) => ({ label: name, value: uuid }),
			locate: (b, id) => b.uuid === id,
			createLabel: "Create a new D1 database",
			placeholder: d1Database.database_name,
			selectQuestion: `Which D1 database should be bound to \`${d1Database.binding}\`?`,
			createQuestion: `What would you like to name your D1 database?`,
		});

		d1Database.database_id = db.uuid;
		d1Database.database_name = db.name;
	}
};

const provisionVectorizeIndices = async (
	ctx: C3Context,
	wranglerConfig: WranglerConfig,
) => {
	if (!wranglerConfig.vectorize) {
		return;
	}

	for (const indexConfig of wranglerConfig.vectorize) {
		const index = await selectOrCreateResource<VectorizeIndex>({
			ctx,
			fetchResources: fetchVectorizeIndices,
			createResource: createVectorizeIndex,
			toOptions: ({ name }) => ({ label: name, value: name }),
			locate: (b, name) => b.name === name,
			createLabel: "Create a new Vectorize index",
			placeholder: indexConfig.index_name,
			selectQuestion: `Which Vectorize indexshould be bound to \`${indexConfig.binding}\`?`,
			createQuestion: `What would you like to name your Vectorize index?`,
		});

		indexConfig.index_name = index.name;
	}
};

const provisionVariables = async (
	ctx: C3Context,
	wranglerConfig: WranglerConfig,
) => {
	if (!wranglerConfig.vars) {
		return;
	}

	for (const key of Object.keys(wranglerConfig.vars)) {
		const value = await inputPrompt({
			type: "text",
			question: `Specify a value for variable ${key}`,
			defaultValue: wranglerConfig.vars[key],
			label: "variable",
		});
		wranglerConfig.vars[key] = value;
	}
};

type SelectOrCreateOptions<T> = {
	ctx: C3Context;
	fetchResources: (ctx: C3Context) => Promise<T[]>;
	toOptions: (item: T) => { label: string; value: string };
	locate: (item: T, id: string) => boolean;
	createLabel: string;
	placeholder: string;
	selectQuestion: string;
	createQuestion: string;
	createResource: (ctx: C3Context, id: string) => Promise<T>;
};

const selectOrCreateResource = async <T>({
	ctx,
	fetchResources,
	toOptions,
	locate,
	createLabel,
	placeholder,
	selectQuestion,
	createQuestion,
	createResource,
}: SelectOrCreateOptions<T>): Promise<T> => {
	const availableResources = await fetchResources(ctx);

	if (availableResources.length > 0) {
		const options = [
			{ label: createLabel, value: "--create" },
			...availableResources.map(toOptions),
		];

		const selection = await inputPrompt({
			type: "select",
			question: selectQuestion,
			options: options,
			// TODO: fix this
			label: "namespace",
		});

		const selectedResource = availableResources.find((r) =>
			locate(r, selection),
		) as T;

		if (selectedResource !== "--create") {
			return selectedResource;
		}
	}

	const newResourceName = await inputPrompt({
		type: "text",
		question: createQuestion,
		defaultValue: placeholder,
		// TODO: fix these
		validate: validateQueueName,
		label: "name",
	});

	return await createResource(ctx, newResourceName);
};
