import { fetchResult } from "../cfetch";
import { type Config } from "../config";
import { requireAuth } from "../user";

export async function CreateQueue(
	config: Config,
	body: CreateQueueBody
): Promise<QueueResponse> {
	const accountId = await requireAuth(config);
	return await fetchResult(`/accounts/${accountId}/workers/queues`, {
		method: "POST",
		body: JSON.stringify(body),
	});
}

export interface CreateQueueBody {
	queue_name: string;
}

export interface QueueResponse {
	queue_name: string;
	created_on: string;
	modified_on: string;
}

export async function DeleteQueue(
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
export async function ListQueues(
	config: Config,
	page?: number
): Promise<QueueResponse[]> {
	page = page || 1;
	const accountId = await requireAuth(config);
	return await fetchResult(
		`/accounts/${accountId}/workers/queues`,
		{},
		new URLSearchParams({ page: page.toString() })
	);
}

export async function GetQueue(
	config: Config,
	queueName: string
): Promise<QueueResponse> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		`/accounts/${accountId}/workers/queues/${queueName}`,
		{}
	);
}

export interface PutConsumerBody {
	settings: ConsumerSettings;
	dead_letter_queue?: string;
}

export interface ConsumerSettings {
	batch_size?: number;
	max_retries?: number;
	max_wait_time_ms?: number;
}

export interface ConsumerResponse extends PutConsumerBody {
	queue_name: string;
	script_name: string;
	environment_name: string;
	settings: ConsumerSettings;
	dead_letter_queue?: string;
}

export async function DeleteConsumer(
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

export async function PutConsumer(
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
