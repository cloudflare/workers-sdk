import { URLSearchParams } from "node:url";
import {
	deletePullConsumer as deletePullConsumerImpl,
	deleteWorkerConsumer as deleteWorkerConsumerImpl,
	getQueue as getQueueImpl,
	listConsumers as listConsumersImpl,
	listQueues as listQueuesImpl,
	postConsumer as postConsumerImpl,
	putConsumer as putConsumerImpl,
	putConsumerById as putConsumerByIdImpl,
} from "@cloudflare/deploy-helpers";
import { UserError } from "@cloudflare/workers-utils";
import { fetchPagedListResult, fetchResult } from "../cfetch";
import { requireAuth } from "../user";
import type {
	CreateEventSubscriptionRequest,
	EventSubscription,
} from "./subscription-types";
import type {
	Consumer,
	PostQueueBody,
	PostQueueResponse,
	PostTypedConsumerBody,
	PurgeQueueBody,
	QueueResponse,
	TypedConsumerResponse,
} from "@cloudflare/deploy-helpers";
import type { Config } from "@cloudflare/workers-utils";

// Queue types now live in `@cloudflare/deploy-helpers`; re-export them here so
// existing `../client` imports across the queue commands keep working.
export type {
	Consumer,
	ConsumerSettings,
	PostQueueBody,
	PostQueueResponse,
	PostTypedConsumerBody,
	Producer,
	PurgeQueueBody,
	PurgeQueueResponse,
	QueueResponse,
	QueueSettings,
	ScriptReference,
	TypedConsumerResponse,
} from "@cloudflare/deploy-helpers";

const queuesUrl = (accountId: string, queueId?: string): string => {
	let url = `/accounts/${accountId}/queues`;
	if (queueId) {
		url += `/${queueId}`;
	}
	return url;
};

export async function createQueue(
	config: Config,
	body: PostQueueBody
): Promise<QueueResponse> {
	const accountId = await requireAuth(config);
	return fetchResult(config, queuesUrl(accountId), {
		method: "POST",
		body: JSON.stringify(body),
	});
}

export async function updateQueue(
	config: Config,
	body: PostQueueBody,
	queue_id: string
): Promise<QueueResponse> {
	const accountId = await requireAuth(config);
	return fetchResult(config, queuesUrl(accountId, queue_id), {
		method: "PATCH",
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
	return fetchResult(config, queuesUrl(accountId, queueId), {
		method: "DELETE",
	});
}

// TODO(soon) show detailed queue response
export async function listQueues(
	config: Config,
	page?: number,
	name?: string
): Promise<QueueResponse[]> {
	const accountId = await requireAuth(config);

	return listQueuesImpl(config, accountId, page, name);
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

	return fetchPagedListResult(config, queuesUrl(accountId), {}, params);
}

export async function getQueue(
	config: Config,
	queueName: string
): Promise<QueueResponse> {
	const accountId = await requireAuth(config);
	return getQueueImpl(config, accountId, queueName);
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
						`Queue "${queue}" does not exist. To create it, run: wrangler queues create ${queue}`,
						{ telemetryMessage: "queues config missing queue" }
					);
				}
			}
		}
	}
}

export async function getQueueById(
	config: Config,
	accountId: string,
	queueId: string
): Promise<QueueResponse> {
	return fetchResult(config, queuesUrl(accountId, queueId), {});
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
	return fetchResult(config, queuesUrl(accountId, queueId), {
		method: "PUT",
		body: JSON.stringify(body),
	});
}

export async function postConsumer(
	config: Config,
	queueName: string,
	body: PostTypedConsumerBody
): Promise<TypedConsumerResponse> {
	const accountId = await requireAuth(config);
	return postConsumerImpl(config, accountId, queueName, body);
}

export async function putConsumerById(
	config: Config,
	queueId: string,
	consumerId: string,
	body: PostTypedConsumerBody
): Promise<TypedConsumerResponse> {
	const accountId = await requireAuth(config);
	return putConsumerByIdImpl(config, accountId, queueId, consumerId, body);
}

export async function putConsumer(
	config: Config,
	queueName: string,
	scriptName: string,
	envName: string | undefined,
	body: PostTypedConsumerBody
): Promise<TypedConsumerResponse> {
	const accountId = await requireAuth(config);
	return putConsumerImpl(
		config,
		accountId,
		queueName,
		scriptName,
		envName,
		body
	);
}

export async function deletePullConsumer(
	config: Config,
	queueName: string
): Promise<void> {
	const accountId = await requireAuth(config);
	return deletePullConsumerImpl(config, accountId, queueName);
}

export async function listConsumers(
	config: Config,
	queueName: string
): Promise<Consumer[]> {
	const accountId = await requireAuth(config);
	return listConsumersImpl(config, accountId, queueName);
}

export async function deleteWorkerConsumer(
	config: Config,
	queueName: string,
	scriptName: string,
	envName?: string
): Promise<void> {
	const accountId = await requireAuth(config);
	return deleteWorkerConsumerImpl(
		config,
		accountId,
		queueName,
		scriptName,
		envName
	);
}

export async function purgeQueue(
	config: Config,
	queueName: string
): Promise<void> {
	const accountId = await requireAuth(config);
	const queue = await getQueue(config, queueName);
	const purgeURL = `${queuesUrl(accountId, queue.queue_id)}/purge`;
	const body: PurgeQueueBody = { delete_messages_permanently: true };
	return fetchResult(config, purgeURL, {
		method: "POST",
		body: JSON.stringify(body),
	});
}

export async function createEventSubscription(
	config: Config,
	queueName: string,
	request: CreateEventSubscriptionRequest
): Promise<EventSubscription> {
	const accountId = await requireAuth(config);
	const queue = await getQueue(config, queueName);

	const body = {
		...request,
		destination: {
			type: "queues.queue" as const,
			queue_id: queue.queue_id,
		},
	};

	return fetchResult(
		config,
		`/accounts/${accountId}/event_subscriptions/subscriptions`,
		{
			method: "POST",
			body: JSON.stringify(body),
		}
	);
}

export async function listEventSubscriptions(
	config: Config,
	queueName: string,
	options?: { page?: number; per_page?: number }
): Promise<EventSubscription[]> {
	const accountId = await requireAuth(config);
	const queue = await getQueue(config, queueName);

	const params = new URLSearchParams({
		queue_id: queue.queue_id,
		page: (options?.page || 1).toString(),
		per_page: (options?.per_page || 20).toString(),
	});

	return fetchResult(
		config,
		`/accounts/${accountId}/event_subscriptions/subscriptions`,
		{},
		params
	);
}

export async function getEventSubscription(
	config: Config,
	subscriptionId: string
): Promise<EventSubscription> {
	const accountId = await requireAuth(config);

	return fetchResult(
		config,
		`/accounts/${accountId}/event_subscriptions/subscriptions/${subscriptionId}`
	);
}

export async function updateEventSubscription(
	config: Config,
	subscriptionId: string,
	request: Partial<
		Pick<CreateEventSubscriptionRequest, "name" | "enabled" | "events">
	>
): Promise<EventSubscription> {
	const accountId = await requireAuth(config);

	return fetchResult(
		config,
		`/accounts/${accountId}/event_subscriptions/subscriptions/${subscriptionId}`,
		{
			method: "PATCH",
			body: JSON.stringify(request),
		}
	);
}

export async function deleteEventSubscription(
	config: Config,
	subscriptionId: string
): Promise<void> {
	const accountId = await requireAuth(config);

	return fetchResult(
		config,
		`/accounts/${accountId}/event_subscriptions/subscriptions/${subscriptionId}`,
		{
			method: "DELETE",
		}
	);
}

export async function getEventSubscriptionForQueue(
	config: Config,
	queueName: string,
	subscriptionId: string
): Promise<EventSubscription> {
	const subscription = await getEventSubscription(config, subscriptionId);
	const queue = await getQueue(config, queueName);

	if (subscription.destination.queue_id !== queue.queue_id) {
		throw new UserError(
			`Subscription '${subscriptionId}' does not belong to queue '${queueName}'. ` +
				`This subscription is configured for a different queue.`,
			{ telemetryMessage: "queues subscription queue mismatch" }
		);
	}

	return subscription;
}
