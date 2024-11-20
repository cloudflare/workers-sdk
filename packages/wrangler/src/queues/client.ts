import { URLSearchParams } from "node:url";
import { fetchPagedListResult, fetchResult } from "../cfetch";
import { type Config } from "../config";
import { UserError } from "../errors";
import { logger } from "../logger";
import { requireAuth } from "../user";

export interface PostQueueBody {
	queue_name: string;
	settings?: QueueSettings;
}

interface WorkerService {
	id: string;
	default_environment: {
		environment: string;
	};
}

export interface QueueSettings {
	delivery_delay?: number;
}

export interface PostQueueResponse {
	queue_id: string;
	queue_name: string;
	settings?: QueueSettings;
	created_on: string;
	modified_on: string;
}

export interface QueueResponse {
	queue_id: string;
	queue_name: string;
	created_on: string;
	modified_on: string;
	producers: Producer[];
	producers_total_count: number;
	consumers: Consumer[];
	consumers_total_count: number;
	settings?: QueueSettings;
}

export interface ScriptReference {
	namespace?: string;
	script?: string;
	service?: string;
	environment?: string;
}

export type Producer = ScriptReference & {
	type: string;
	bucket_name?: string;
};

export type Consumer = ScriptReference & {
	dead_letter_queue?: string;
	settings: ConsumerSettings;
	consumer_id: string;
	bucket_name?: string;
	type: string;
};

export interface TypedConsumerResponse extends Consumer {
	queue_name: string;
	created_on: string;
}

export interface PostTypedConsumerBody {
	type: string;
	script_name?: string;
	environment_name?: string;
	settings: ConsumerSettings;
	dead_letter_queue?: string;
}

export interface ConsumerSettings {
	batch_size?: number;
	max_retries?: number;
	max_wait_time_ms?: number;
	max_concurrency?: number | null;
	visibility_timeout_ms?: number;
	retry_delay?: number;
}

const queuesUrl = (accountId: string, queueId?: string): string => {
	let url = `/accounts/${accountId}/queues`;
	if (queueId) {
		url += `/${queueId}`;
	}
	return url;
};

const queueConsumersUrl = (
	accountId: string,
	queueId: string,
	consumerId?: string
): string => {
	let url = `${queuesUrl(accountId, queueId)}/consumers`;
	if (consumerId) {
		url += `/${consumerId}`;
	}
	return url;
};

export async function createQueue(
	config: Config,
	body: PostQueueBody
): Promise<QueueResponse> {
	const accountId = await requireAuth(config);
	return fetchResult(queuesUrl(accountId), {
		method: "POST",
		body: JSON.stringify(body),
	});
}

export async function deleteQueue(
	config: Config,
	queueName: string
): Promise<void> {
	const queue = await getQueue(config, queueName);
	return deleteQueueById(config, queue.queue_id);
}

async function deleteQueueById(config: Config, queueId: string): Promise<void> {
	const accountId = await requireAuth(config);
	return fetchResult(queuesUrl(accountId, queueId), {
		method: "DELETE",
	});
}

// TODO(soon) show detailed queue response
export async function listQueues(
	config: Config,
	page?: number,
	name?: string
): Promise<QueueResponse[]> {
	page = page ?? 1;
	const accountId = await requireAuth(config);
	const params = new URLSearchParams({ page: page.toString() });

	if (name) {
		params.append("name", name);
	}

	return fetchResult(queuesUrl(accountId), {}, params);
}

async function listAllQueues(
	config: Config,
	queueNames: string[]
): Promise<QueueResponse[]> {
	const accountId = await requireAuth(config);
	const params = new URLSearchParams();

	queueNames.forEach((e) => {
		params.append("name", e);
	});

	return fetchPagedListResult(queuesUrl(accountId), {}, params);
}

export async function getQueue(
	config: Config,
	queueName: string
): Promise<QueueResponse> {
	const queues = await listQueues(config, 1, queueName);
	if (queues.length === 0) {
		throw new UserError(
			`Queue "${queueName}" does not exist. To create it, run: wrangler queues create ${queueName}`
		);
	}
	return queues[0];
}

export async function ensureQueuesExistByConfig(config: Config) {
	const producers = (config.queues.producers || []).map(
		(producer) => producer.queue
	);
	const consumers = (config.queues.consumers || []).map(
		(consumer) => consumer.queue
	);

	const queueNames = producers.concat(consumers);
	await ensureQueuesExist(config, queueNames);
}

async function ensureQueuesExist(config: Config, queueNames: string[]) {
	if (queueNames.length > 0) {
		const existingQueues = (await listAllQueues(config, queueNames)).map(
			(q) => q.queue_name
		);

		if (queueNames.length !== existingQueues.length) {
			const queueSet = new Set(existingQueues);

			for (const queue of queueNames) {
				if (!queueSet.has(queue)) {
					throw new UserError(
						`Queue "${queue}" does not exist. To create it, run: wrangler queues create ${queue}`
					);
				}
			}
		}
	}
}

export async function getQueueById(
	accountId: string,
	queueId: string
): Promise<QueueResponse> {
	return fetchResult(queuesUrl(accountId, queueId), {});
}

export async function putQueue(
	config: Config,
	queueName: string,
	body: PostQueueBody
): Promise<PostQueueResponse> {
	const queue = await getQueue(config, queueName);
	return putQueueById(config, queue.queue_id, body);
}

async function putQueueById(
	config: Config,
	queueId: string,
	body: PostQueueBody
): Promise<PostQueueResponse> {
	const accountId = await requireAuth(config);
	return fetchResult(queuesUrl(accountId, queueId), {
		method: "PUT",
		body: JSON.stringify(body),
	});
}

export async function postConsumer(
	config: Config,
	queueName: string,
	body: PostTypedConsumerBody
): Promise<TypedConsumerResponse> {
	const queue = await getQueue(config, queueName);
	return postConsumerById(config, queue.queue_id, body);
}

async function postConsumerById(
	config: Config,
	queueId: string,
	body: PostTypedConsumerBody
): Promise<TypedConsumerResponse> {
	const accountId = await requireAuth(config);
	return fetchResult(queueConsumersUrl(accountId, queueId), {
		method: "POST",
		body: JSON.stringify(body),
	});
}

export async function putConsumerById(
	config: Config,
	queueId: string,
	consumerId: string,
	body: PostTypedConsumerBody
): Promise<TypedConsumerResponse> {
	const accountId = await requireAuth(config);
	return fetchResult(queueConsumersUrl(accountId, queueId, consumerId), {
		method: "PUT",
		body: JSON.stringify(body),
	});
}

export async function putConsumer(
	config: Config,
	queueName: string,
	scriptName: string,
	envName: string | undefined,
	body: PostTypedConsumerBody
): Promise<TypedConsumerResponse> {
	const queue = await getQueue(config, queueName);
	const targetConsumer = await resolveWorkerConsumerByName(
		config,
		scriptName,
		envName,
		queue
	);
	return putConsumerById(
		config,
		queue.queue_id,
		targetConsumer.consumer_id,
		body
	);
}

async function resolveWorkerConsumerByName(
	config: Config,
	consumerName: string,
	envName: string | undefined,
	queue: QueueResponse
): Promise<Consumer> {
	const queueName = queue.queue_name;
	const consumers = queue.consumers.filter(
		(c) =>
			c.type === "worker" &&
			(c.script === consumerName || c.service === consumerName)
	);

	if (consumers.length === 0) {
		throw new UserError(
			`No worker consumer '${consumerName}' exists for queue ${queue.queue_name}`
		);
	}

	// If more than a consumer with the same name is found, it should be
	// a service+environment combination
	if (consumers.length > 1) {
		const targetEnv =
			envName ?? (await getDefaultService(config, consumerName));
		const targetConsumers = consumers.filter(
			(c) => c.environment === targetEnv
		);

		if (targetConsumers.length === 0) {
			throw new UserError(
				`No worker consumer '${consumerName}' exists for queue ${queueName}`
			);
		}
		return consumers[0];
	}

	if (consumers[0].service) {
		const targetEnv =
			envName ?? (await getDefaultService(config, consumerName));
		if (targetEnv != consumers[0].environment) {
			throw new UserError(
				`No worker consumer '${consumerName}' exists for queue ${queueName}`
			);
		}
	}
	return consumers[0];
}

async function deleteConsumerById(
	config: Config,
	queueId: string,
	consumerId: string
): Promise<void> {
	const accountId = await requireAuth(config);
	return fetchResult(queueConsumersUrl(accountId, queueId, consumerId), {
		method: "DELETE",
	});
}

export async function deletePullConsumer(
	config: Config,
	queueName: string
): Promise<void> {
	const queue = await getQueue(config, queueName);
	const consumer = queue.consumers[0];
	if (consumer?.type !== "http_pull") {
		throw new UserError(`No http_pull consumer exists for queue ${queueName}`);
	}
	return deleteConsumerById(config, queue.queue_id, consumer.consumer_id);
}

async function getDefaultService(
	config: Config,
	serviceName: string
): Promise<string> {
	const accountId = await requireAuth(config);
	const service = await fetchResult<WorkerService>(
		`/accounts/${accountId}/workers/services/${serviceName}`,
		{
			method: "GET",
		}
	);

	logger.info(service);

	return service.default_environment.environment;
}

export async function deleteWorkerConsumer(
	config: Config,
	queueName: string,
	scriptName: string,
	envName?: string
): Promise<void> {
	const queue = await getQueue(config, queueName);
	const targetConsumer = await resolveWorkerConsumerByName(
		config,
		scriptName,
		envName,
		queue
	);
	return deleteConsumerById(config, queue.queue_id, targetConsumer.consumer_id);
}
