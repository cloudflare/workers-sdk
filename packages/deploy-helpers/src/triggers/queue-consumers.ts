import { UserError } from "@cloudflare/workers-utils";
import type { DeployHelpersContext, TriggerDeployment } from "../shared/types";
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
	ctx: DeployHelpersContext,
	page?: number,
	name?: string
): Promise<QueueResponse[]> {
	page = page ?? 1;
	const params = new URLSearchParams({ page: page.toString() });

	if (name) {
		params.append("name", name);
	}

	return ctx.fetchResult<QueueResponse[]>(
		complianceConfig,
		`/accounts/${accountId}/queues`,
		{},
		params
	);
}

export async function getQueue(
	complianceConfig: ComplianceConfig,
	accountId: string,
	queueName: string,
	ctx: DeployHelpersContext
): Promise<QueueResponse> {
	const queues = await listQueues(
		complianceConfig,
		accountId,
		ctx,
		1,
		queueName
	);
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
	body: PostTypedConsumerBody,
	ctx: DeployHelpersContext
): Promise<TypedConsumerResponse> {
	const queue = await getQueue(complianceConfig, accountId, queueName, ctx);
	return postConsumerById(
		complianceConfig,
		accountId,
		ctx,
		queue.queue_id,
		body
	);
}

async function postConsumerById(
	config: ComplianceConfig,
	accountId: string,
	ctx: DeployHelpersContext,
	queueId: string,
	body: PostTypedConsumerBody
): Promise<TypedConsumerResponse> {
	return ctx.fetchResult(
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
	body: PostTypedConsumerBody,
	ctx: DeployHelpersContext
): Promise<TypedConsumerResponse> {
	return ctx.fetchResult(
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
	body: PostTypedConsumerBody,
	ctx: DeployHelpersContext
): Promise<TypedConsumerResponse> {
	const queue = await getQueue(complianceConfig, accountId, queueName, ctx);
	const targetConsumer = await resolveWorkerConsumerByName(
		complianceConfig,
		accountId,
		scriptName,
		envName,
		queue,
		ctx
	);
	return putConsumerById(
		complianceConfig,
		accountId,
		queue.queue_id,
		targetConsumer.consumer_id,
		body,
		ctx
	);
}

async function resolveWorkerConsumerByName(
	complianceConfig: ComplianceConfig,
	accountId: string,
	consumerName: string,
	envName: string | undefined,
	queue: QueueResponse,
	ctx: DeployHelpersContext
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
			(await getDefaultService(complianceConfig, accountId, consumerName, ctx));
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
			(await getDefaultService(complianceConfig, accountId, consumerName, ctx));
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
	serviceName: string,
	ctx: DeployHelpersContext
): Promise<string> {
	const service = await ctx.fetchResult<WorkerService>(
		complianceConfig,
		`/accounts/${accountId}/workers/services/${serviceName}`,
		{
			method: "GET",
		}
	);

	ctx.logger.info(service);

	return service.default_environment.environment;
}

async function deleteConsumerById(
	complianceConfig: ComplianceConfig,
	accountId: string,
	queueId: string,
	consumerId: string,
	ctx: DeployHelpersContext
): Promise<void> {
	return ctx.fetchResult(
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
	queueName: string,
	ctx: DeployHelpersContext
): Promise<void> {
	const queue = await getQueue(complianceConfig, accountId, queueName, ctx);
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
		consumer.consumer_id,
		ctx
	);
}

export async function listConsumers(
	complianceConfig: ComplianceConfig,
	accountId: string,
	queueName: string,
	ctx: DeployHelpersContext
): Promise<Consumer[]> {
	const queue = await getQueue(complianceConfig, accountId, queueName, ctx);
	return queue.consumers;
}

export async function deleteWorkerConsumer(
	complianceConfig: ComplianceConfig,
	accountId: string,
	queueName: string,
	scriptName: string,
	envName: string | undefined,
	ctx: DeployHelpersContext
): Promise<void> {
	const queue = await getQueue(complianceConfig, accountId, queueName, ctx);
	const targetConsumer = await resolveWorkerConsumerByName(
		complianceConfig,
		accountId,
		scriptName,
		envName,
		queue,
		ctx
	);
	return deleteConsumerById(
		complianceConfig,
		accountId,
		queue.queue_id,
		targetConsumer.consumer_id,
		ctx
	);
}

export async function updateQueueConsumers(
	complianceConfig: ComplianceConfig,
	accountId: string,
	scriptName: string,
	config: Config,
	ctx: DeployHelpersContext
): Promise<Promise<TriggerDeployment>[]> {
	const consumers = config.queues.consumers || [];
	const updateConsumers: Promise<TriggerDeployment>[] = [];
	for (const consumer of consumers) {
		const queue = await getQueue(
			complianceConfig,
			accountId,
			consumer.queue,
			ctx
		);

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
					body,
					ctx
				).then(
					() => ({ targets: [`Consumer for ${consumer.queue}`] }),
					(error) => ({ targets: [], error })
				)
			);
			continue;
		}
		updateConsumers.push(
			postConsumer(complianceConfig, accountId, consumer.queue, body, ctx).then(
				() => ({
					targets: [`Consumer for ${consumer.queue}`],
				}),
				(error) => ({ targets: [], error })
			)
		);
	}

	return updateConsumers;
}
