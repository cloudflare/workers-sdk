import { UserError } from "@cloudflare/workers-utils";
import { fetchPagedListResult, fetchResult, logger } from "../shared/context";
import type { TriggerDeployment } from "../shared/types";
import type { Config, ComplianceConfig } from "@cloudflare/workers-utils";

export interface PostQueueBody {
	queue_name: string;
	settings?: QueueSettings;
}

export interface QueueSettings {
	delivery_delay?: number;
	delivery_paused?: boolean;
	message_retention_period?: number;
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

export interface PurgeQueueBody {
	delete_messages_permanently: boolean;
}

export interface PurgeQueueResponse {
	started_at: string;
	complete: boolean;
}

export async function listQueues(
	complianceConfig: ComplianceConfig,
	accountId: string,
	page?: number,
	name?: string
): Promise<QueueResponse[]> {
	page = page ?? 1;
	const params = new URLSearchParams({ page: page.toString() });

	if (name) {
		params.append("name", name);
	}

	return fetchResult<QueueResponse[]>(
		complianceConfig,
		`/accounts/${accountId}/queues`,
		{},
		params
	);
}

export async function getQueue(
	complianceConfig: ComplianceConfig,
	accountId: string,
	queueName: string
): Promise<QueueResponse> {
	const queues = await listQueues(complianceConfig, accountId, 1, queueName);
	if (queues.length === 0) {
		throw new UserError(
			`Queue "${queueName}" does not exist. To create it, run: wrangler queues create ${queueName}`,
			{ telemetryMessage: "queues lookup missing queue" }
		);
	}
	return queues[0];
}

export async function postConsumer(
	complianceConfig: ComplianceConfig,
	accountId: string,
	queueName: string,
	body: PostTypedConsumerBody
): Promise<TypedConsumerResponse> {
	const queue = await getQueue(complianceConfig, accountId, queueName);
	return postConsumerById(complianceConfig, accountId, queue.queue_id, body);
}

async function postConsumerById(
	config: ComplianceConfig,
	accountId: string,
	queueId: string,
	body: PostTypedConsumerBody
): Promise<TypedConsumerResponse> {
	return fetchResult(
		config,
		`/accounts/${accountId}/queues/${queueId}/consumers`,
		{
			method: "POST",
			body: JSON.stringify(body),
		}
	);
}

export async function putConsumerById(
	complianceConfig: ComplianceConfig,
	accountId: string,
	queueId: string,
	consumerId: string,
	body: PostTypedConsumerBody
): Promise<TypedConsumerResponse> {
	return fetchResult(
		complianceConfig,
		`/accounts/${accountId}/queues/${queueId}/consumers/${consumerId}`,
		{
			method: "PUT",
			body: JSON.stringify(body),
		}
	);
}

export async function putConsumer(
	complianceConfig: ComplianceConfig,
	accountId: string,
	queueName: string,
	scriptName: string,
	envName: string | undefined,
	body: PostTypedConsumerBody
): Promise<TypedConsumerResponse> {
	const queue = await getQueue(complianceConfig, accountId, queueName);
	const targetConsumer = await resolveWorkerConsumerByName(
		complianceConfig,
		accountId,
		scriptName,
		envName,
		queue
	);
	return putConsumerById(
		complianceConfig,
		accountId,
		queue.queue_id,
		targetConsumer.consumer_id,
		body
	);
}

async function resolveWorkerConsumerByName(
	complianceConfig: ComplianceConfig,
	accountId: string,
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
			`No worker consumer '${consumerName}' exists for queue ${queue.queue_name}`,
			{ telemetryMessage: "queues worker consumer missing" }
		);
	}

	// If more than a consumer with the same name is found, it should be
	// a service+environment combination
	if (consumers.length > 1) {
		const targetEnv =
			envName ??
			(await getDefaultService(complianceConfig, accountId, consumerName));
		const targetConsumers = consumers.filter(
			(c) => c.environment === targetEnv
		);

		if (targetConsumers.length === 0) {
			throw new UserError(
				`No worker consumer '${consumerName}' exists for queue ${queueName}`,
				{ telemetryMessage: "queues worker consumer missing environment" }
			);
		}
		return targetConsumers[0];
	}

	if (consumers[0].service) {
		const targetEnv =
			envName ??
			(await getDefaultService(complianceConfig, accountId, consumerName));
		if (targetEnv != consumers[0].environment) {
			throw new UserError(
				`No worker consumer '${consumerName}' exists for queue ${queueName}`,
				{ telemetryMessage: "queues worker consumer environment mismatch" }
			);
		}
	}
	return consumers[0];
}

interface WorkerService {
	id: string;
	default_environment: {
		environment: string;
	};
}

async function getDefaultService(
	complianceConfig: ComplianceConfig,
	accountId: string,
	serviceName: string
): Promise<string> {
	const service = await fetchResult<WorkerService>(
		complianceConfig,
		`/accounts/${accountId}/workers/services/${serviceName}`,
		{
			method: "GET",
		}
	);

	logger.info(service);

	return service.default_environment.environment;
}

async function deleteConsumerById(
	complianceConfig: ComplianceConfig,
	accountId: string,
	queueId: string,
	consumerId: string
): Promise<void> {
	return fetchResult(
		complianceConfig,
		`/accounts/${accountId}/queues/${queueId}/consumers/${consumerId}`,
		{
			method: "DELETE",
		}
	);
}

export async function deletePullConsumer(
	complianceConfig: ComplianceConfig,
	accountId: string,
	queueName: string
): Promise<void> {
	const queue = await getQueue(complianceConfig, accountId, queueName);
	const consumer = queue.consumers[0];
	if (consumer?.type !== "http_pull") {
		throw new UserError(`No http_pull consumer exists for queue ${queueName}`, {
			telemetryMessage: "queues http pull consumer missing",
		});
	}
	return deleteConsumerById(
		complianceConfig,
		accountId,
		queue.queue_id,
		consumer.consumer_id
	);
}

export async function listConsumers(
	complianceConfig: ComplianceConfig,
	accountId: string,
	queueName: string
): Promise<Consumer[]> {
	const queue = await getQueue(complianceConfig, accountId, queueName);
	return queue.consumers;
}

export async function deleteWorkerConsumer(
	complianceConfig: ComplianceConfig,
	accountId: string,
	queueName: string,
	scriptName: string,
	envName: string | undefined
): Promise<void> {
	const queue = await getQueue(complianceConfig, accountId, queueName);
	const targetConsumer = await resolveWorkerConsumerByName(
		complianceConfig,
		accountId,
		scriptName,
		envName,
		queue
	);
	return deleteConsumerById(
		complianceConfig,
		accountId,
		queue.queue_id,
		targetConsumer.consumer_id
	);
}

export async function updateQueueConsumers(
	complianceConfig: ComplianceConfig,
	accountId: string,
	scriptName: string,
	config: Config
): Promise<Promise<TriggerDeployment>[]> {
	const consumers = config.queues.consumers || [];
	const updateConsumers: Promise<TriggerDeployment>[] = [];
	for (const consumer of consumers) {
		const queue = await getQueue(complianceConfig, accountId, consumer.queue);

		const body: PostTypedConsumerBody = {
			type: "worker",
			dead_letter_queue: consumer.dead_letter_queue,
			script_name: scriptName,
			settings: {
				batch_size: consumer.max_batch_size,
				max_retries: consumer.max_retries,
				max_wait_time_ms:
					consumer.max_batch_timeout !== undefined
						? 1000 * consumer.max_batch_timeout
						: undefined,
				max_concurrency: consumer.max_concurrency,
				retry_delay: consumer.retry_delay,
			},
		};

		// Current script already assigned to queue?
		const existingConsumer =
			queue.consumers.filter(
				(c) => c.script === scriptName || c.service === scriptName
			).length > 0;
		const envName = undefined; // TODO: script environment for wrangler deploy?
		if (existingConsumer) {
			updateConsumers.push(
				putConsumer(
					complianceConfig,
					accountId,
					consumer.queue,
					scriptName,
					envName,
					body
				).then(
					() => ({ targets: [`Consumer for ${consumer.queue}`] }),
					(error) => ({ targets: [], error })
				)
			);
			continue;
		}
		updateConsumers.push(
			postConsumer(complianceConfig, accountId, consumer.queue, body).then(
				() => ({
					targets: [`Consumer for ${consumer.queue}`],
				}),
				(error) => ({ targets: [], error })
			)
		);
	}

	return updateConsumers;
}

const queuesUrl = (accountId: string, queueId?: string): string => {
	let url = `/accounts/${accountId}/queues`;
	if (queueId) {
		url += `/${queueId}`;
	}
	return url;
};

export async function ensureQueuesExistByConfig(
	config: Config,
	accountId: string
) {
	const producers = (config.queues.producers || []).map(
		(producer) => producer.queue
	);
	const consumers = (config.queues.consumers || []).map(
		(consumer) => consumer.queue
	);

	const queueNames = producers.concat(consumers);
	if (queueNames.length > 0) {
		const params = new URLSearchParams();
		queueNames.forEach((e) => {
			params.append("name", e);
		});

		const existingQueues = (
			await fetchPagedListResult<QueueResponse>(
				config,
				queuesUrl(accountId),
				{},
				params
			)
		).map((q) => q.queue_name);

		if (queueNames.length !== existingQueues.length) {
			const queueSet = new Set(existingQueues);

			for (const queue of queueNames) {
				if (!queueSet.has(queue)) {
					throw new UserError(
						`Queue "${queue}" does not exist. To create it, run: wrangler queues create ${queue}`,
						{ telemetryMessage: "queues config missing queue" }
					);
				}
			}
		}
	}
}
