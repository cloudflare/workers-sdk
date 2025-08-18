import { http, HttpResponse } from "msw";
import { EventSourceType } from "../../queues/subscription-types";
import { msw } from "../helpers/msw";
import type { QueueResponse } from "../../queues/client";
import type {
	CreateEventSubscriptionRequest,
	EventSubscription,
} from "../../queues/subscription-types";

export function mockGetQueueByNameRequest(
	queueName: string,
	queue: QueueResponse | null
) {
	const requests = { count: 0 };
	msw.use(
		http.get(
			"*/accounts/:accountId/queues?*",
			async ({ request }) => {
				const url = new URL(request.url);

				requests.count += 1;
				if (queue) {
					const nameParam = url.searchParams.getAll("name");
					expect(nameParam.length).toBeGreaterThan(0);
					expect(nameParam[0]).toEqual(queueName);
				}
				expect(await request.text()).toEqual("");
				return HttpResponse.json({
					success: true,
					errors: [],
					messages: [],
					result: queue ? [queue] : [],
				});
			},
			{ once: true }
		)
	);
	return requests;
}

export function mockCreateSubscriptionRequest(
	expectedRequest: Partial<CreateEventSubscriptionRequest>,
	expectedQueueId: string
) {
	const requests = { count: 0 };
	msw.use(
		http.post(
			"*/accounts/:accountId/event_subscriptions/subscriptions",
			async ({ request }) => {
				requests.count += 1;
				const body = (await request.json()) as CreateEventSubscriptionRequest;
				expect(body.name).toEqual(expectedRequest.name);
				expect(body.enabled).toEqual(expectedRequest.enabled);
				expect(body.source).toEqual(expectedRequest.source);
				expect(body.events).toEqual(expectedRequest.events);
				return HttpResponse.json({
					success: true,
					errors: [],
					messages: [],
					result: {
						id: "sub-123",
						created_at: "2024-01-01T00:00:00Z",
						modified_at: "2024-01-01T00:00:00Z",
						name: body.name,
						enabled: body.enabled,
						source: body.source,
						destination: {
							type: "queues.queue",
							queue_id: expectedQueueId,
						},
						events: body.events,
					} as EventSubscription,
				});
			},
			{ once: true }
		)
	);
	return requests;
}

export function mockListSubscriptionsRequest(
	queueId: string,
	subscriptions: EventSubscription[]
) {
	const requests = { count: 0 };
	msw.use(
		http.get(
			"*/accounts/:accountId/event_subscriptions/subscriptions?*",
			async ({ request }) => {
				requests.count += 1;
				const url = new URL(request.url);
				expect(url.searchParams.get("queue_id")).toEqual(queueId);
				return HttpResponse.json({
					success: true,
					errors: [],
					messages: [],
					result: subscriptions,
					result_info: {
						count: subscriptions.length,
						total_count: subscriptions.length,
						page: 1,
						per_page: 20,
						total_pages: 1,
					},
				});
			},
			{ once: true }
		)
	);
	return requests;
}

export function mockGetSubscriptionRequest(
	subscriptionId: string,
	subscription: EventSubscription | null
) {
	const requests = { count: 0 };
	msw.use(
		http.get(
			"*/accounts/:accountId/event_subscriptions/subscriptions/:subscriptionId",
			async ({ params }) => {
				requests.count += 1;
				expect(params.subscriptionId).toEqual(subscriptionId);

				if (!subscription) {
					return HttpResponse.json(
						{
							success: false,
							errors: [{ code: 404, message: "Subscription not found" }],
						},
						{ status: 404 }
					);
				}

				return HttpResponse.json({
					success: true,
					errors: [],
					messages: [],
					result: subscription,
				});
			},
			{ once: true }
		)
	);
	return requests;
}

export function mockDeleteSubscriptionRequest(subscriptionId: string) {
	const requests = { count: 0 };
	msw.use(
		http.delete(
			"*/accounts/:accountId/event_subscriptions/subscriptions/:subscriptionId",
			async ({ params }) => {
				requests.count += 1;
				expect(params.subscriptionId).toEqual(subscriptionId);
				return HttpResponse.json({
					success: true,
					errors: [],
					messages: [],
					result: {},
				});
			},
			{ once: true }
		)
	);
	return requests;
}

export function mockUpdateSubscriptionRequest(
	subscriptionId: string,
	expectedBody: object
) {
	const requests = { count: 0 };
	msw.use(
		http.patch(
			"*/accounts/:accountId/event_subscriptions/subscriptions/:subscriptionId",
			async ({ request, params }) => {
				requests.count += 1;
				expect(params.subscriptionId).toEqual(subscriptionId);
				expect(params.accountId).toEqual("some-account-id");
				expect(await request.json()).toEqual(expectedBody);
				return HttpResponse.json({
					success: true,
					errors: [],
					messages: [],
					result: {
						id: subscriptionId,
						name: "updated-subscription",
						source: {
							type: EventSourceType.WORKERS_BUILDS_WORKER,
							worker_name: "my-worker",
						},
						destination: {
							queue_id: "queue-id-1",
						},
						events: ["build.completed", "build.failed"],
						enabled: false,
						modified_at: "2023-01-01T00:00:00.000Z",
					},
				});
			}
		)
	);
	return requests;
}
