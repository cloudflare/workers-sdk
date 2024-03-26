import { fetchResult } from "../cfetch";
import { type Config } from "../config";
import { UserError } from "../errors";
import { requireAuth } from "../user";

export async function createQueue(
	config: Config,
	body: PostQueueBody
): Promise<QueueResponse> {
	const accountId = await requireAuth(config);
	return await fetchResult(`/accounts/${accountId}/workers/queues`, {
		method: "POST",
		body: JSON.stringify(body),
	});
}

export interface PostQueueBody {
	queue_name: string;
	settings?: QueueSettings;
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

export interface ScriptReference {
	namespace?: string;
	script?: string;
	service?: string;
	environment?: string;
}

export type Consumer = ScriptReference & {
	dead_letter_queue?: string;
	settings: ConsumerSettings;
	consumer_id: string;
	bucket_name?: string;
	type: string;
};

export interface QueueResponse {
	queue_id: string;
	queue_name: string;
	created_on: string;
	modified_on: string;
	producers: ScriptReference[];
	producers_total_count: number;
	consumers: Consumer[];
	consumers_total_count: number;
	settings?: QueueSettings;
}

export async function deleteQueue(
	config: Config,
	queueName: string
): Promise<void> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		`/accounts/${accountId}/workers/queues/${queueName}`,
		{
			method: "DELETE",
		}
	);
}

// TODO(soon) show detailed queue response
export async function listQueues(
	config: Config,
	page?: number
): Promise<QueueResponse[]> {
	page = page ?? 1;
	const accountId = await requireAuth(config);
	return await fetchResult(
		`/accounts/${accountId}/workers/queues`,
		{},
		new URLSearchParams({ page: page.toString() })
	);
}

export async function getQueue(
	config: Config,
	queueName: string
): Promise<QueueResponse> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		`/accounts/${accountId}/workers/queues/${queueName}`,
		{}
	);
}

export async function postConsumer(
	config: Config,
	queueName: string,
	body: PostConsumerBody
): Promise<ConsumerResponse> {
	const accountId = await requireAuth(config);
	return fetchResult(
		`/accounts/${accountId}/workers/queues/${queueName}/consumers`,
		{
			method: "POST",
			body: JSON.stringify(body),
		}
	);
}

export async function postTypedConsumer(
	config: Config,
	queueName: string,
	body: PostTypedConsumerBody
): Promise<TypedConsumerResponse> {
	const accountId = await requireAuth(config);
	const queue = await getQueue(config, queueName);
	return fetchResult(
		`/accounts/${accountId}/queues/${queue.queue_id}/consumers`,
		{
			method: "POST",
			body: JSON.stringify(body),
		}
	);
}

export async function putTypedConsumer(
	config: Config,
	queueId: string,
	consumerId: string,
	body: PostTypedConsumerBody
): Promise<TypedConsumerResponse> {
	const accountId = await requireAuth(config);

	return fetchResult(
		`/accounts/${accountId}/queues/${queueId}/consumers/${consumerId}`,
		{
			method: "PUT",
			body: JSON.stringify(body),
		}
	);
}

export async function putQueue(
	config: Config,
	queueId: string,
	body: PostQueueBody
): Promise<PostQueueResponse> {
	const accountId = await requireAuth(config);
	return fetchResult(`/accounts/${accountId}/queues/${queueId}/`, {
		method: "PUT",
		body: JSON.stringify(body),
	});
}

export interface TypedConsumerResponse extends Consumer {
	queue_name: string;
	created_on: string;
}

export interface PostTypedConsumerBody extends PutConsumerBody {
	type: string;
	script_name?: string;
	environment_name?: string;
}

export interface PutConsumerBody {
	settings: ConsumerSettings;
	dead_letter_queue?: string;
}

export interface PostConsumerBody extends PutConsumerBody {
	script_name: string;
	environment_name: string;
}

export interface ConsumerSettings {
	batch_size?: number;
	max_retries?: number;
	max_wait_time_ms?: number;
	max_concurrency?: number | null;
	visibility_timeout_ms?: number;
	retry_delay?: number;
}

export interface ConsumerResponse extends PostConsumerBody {
	queue_name: string;
	script_name: string;
	environment_name: string;
	settings: ConsumerSettings;
	dead_letter_queue?: string;
}

export async function deletePullConsumer(
	config: Config,
	queueName: string
): Promise<void> {
	const accountId = await requireAuth(config);
	const queue = await getQueue(config, queueName);
	const consumer = queue.consumers[0];
	if (consumer?.type !== "http_pull") {
		throw new UserError(`No http_pull consumer exists for queue ${queueName}`);
	}
	const resource = `/accounts/${accountId}/queues/${queue.queue_id}/consumers/${consumer.consumer_id}`;
	return fetchResult(resource, {
		method: "DELETE",
	});
}

export async function deleteConsumer(
	config: Config,
	queueName: string,
	scriptName: string,
	envName?: string
): Promise<void> {
	const accountId = await requireAuth(config);
	let resource = `/accounts/${accountId}/workers/queues/${queueName}/consumers/${scriptName}`;
	if (envName !== undefined) {
		resource += `/environments/${envName}`;
	}
	return fetchResult(resource, {
		method: "DELETE",
	});
}

export async function putConsumer(
	config: Config,
	queueName: string,
	scriptName: string,
	envName: string | undefined,
	body: PutConsumerBody
): Promise<ConsumerResponse> {
	const accountId = await requireAuth(config);
	let resource = `/accounts/${accountId}/workers/queues/${queueName}/consumers/${scriptName}`;
	if (envName !== undefined) {
		resource += `/environments/${envName}`;
	}
	return fetchResult(resource, {
		method: "PUT",
		body: JSON.stringify(body),
	});
}
