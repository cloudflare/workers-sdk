import { EventSourceType } from "../../queues/subscription-types";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { mockConfirm } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import {
	mockCreateSubscriptionRequest,
	mockDeleteSubscriptionRequest,
	mockGetQueueByNameRequest,
	mockGetSubscriptionRequest,
	mockListSubscriptionsRequest,
	mockUpdateSubscriptionRequest,
} from "./mock-utils";
import type {
	CreateEventSubscriptionRequest,
	EventSubscription,
} from "../../queues/subscription-types";

describe("queues subscription", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();

	const std = mockConsoleMethods();
	const expectedQueueId = "queueId";
	const expectedQueueName = "testQueue";

	const mockSubscription1: EventSubscription = {
		id: "sub-123",
		created_at: "2024-01-01T00:00:00Z",
		modified_at: "2024-01-01T00:00:00Z",
		name: "Test Subscription 1",
		enabled: true,
		source: {
			type: EventSourceType.WORKERS_BUILDS_WORKER,
			worker_name: "my-worker",
		},
		destination: {
			type: "queues.queue",
			queue_id: expectedQueueId,
		},
		events: ["build.completed", "build.failed"],
	};

	const mockSubscription2: EventSubscription = {
		id: "sub-456",
		created_at: "2024-01-02T00:00:00Z",
		modified_at: "2024-01-02T00:00:00Z",
		name: "Test Subscription 2",
		enabled: false,
		source: {
			type: EventSourceType.KV,
		},
		destination: {
			type: "queues.queue",
			queue_id: expectedQueueId,
		},
		events: ["namespace.created"],
	};

	describe("create", () => {
		it("should show the correct help text", async () => {
			await runWrangler("queues subscription create --help");
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"wrangler queues subscription create <queue>

				Create a new event subscription for a queue

				POSITIONALS
				  queue  The name of the queue to create the subscription for  [string] [required]

				GLOBAL FLAGS
				  -c, --config    Path to Wrangler configuration file  [string]
				      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
				  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
				  -h, --help      Show help  [boolean]
				  -v, --version   Show version number  [boolean]

				OPTIONS
				      --source         The event source type  [string] [required] [choices: \\"kv\\", \\"r2\\", \\"superSlurper\\", \\"vectorize\\", \\"workersAi.model\\", \\"workersBuilds.worker\\", \\"workflows.workflow\\"]
				      --events         Comma-separated list of event types to subscribe to  [string] [required]
				      --name           Name for the subscription (auto-generated if not provided)  [string]
				      --enabled        Whether the subscription should be active  [boolean] [default: true]
				      --model-name     Workers AI model name (required for workersAi.model source)  [string]
				      --worker-name    Worker name (required for workersBuilds.worker source)  [string]
				      --workflow-name  Workflow name (required for workflows.workflow source)  [string]"
			`);
		});

		it("should create a subscription for workersBuilds.worker source", async () => {
			const queueNameResolveRequest = mockGetQueueByNameRequest(
				expectedQueueName,
				{
					queue_id: expectedQueueId,
					queue_name: expectedQueueName,
					created_on: "",
					producers: [],
					consumers: [],
					producers_total_count: 0,
					consumers_total_count: 0,
					modified_on: "",
				}
			);

			const expectedRequest: Partial<CreateEventSubscriptionRequest> = {
				name: "testQueue workersBuilds.worker",
				enabled: true,
				source: {
					type: EventSourceType.WORKERS_BUILDS_WORKER,
					worker_name: "my-worker",
				},
				events: ["build.completed", "build.failed"],
			};

			const createRequest = mockCreateSubscriptionRequest(
				expectedRequest,
				expectedQueueId
			);

			await runWrangler(
				"queues subscription create testQueue --source workersBuilds.worker --events build.completed,build.failed --worker-name my-worker"
			);

			expect(queueNameResolveRequest.count).toEqual(1);
			expect(createRequest.count).toEqual(1);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"Creating event subscription for queue 'testQueue'...
				✨ Successfully created event subscription 'testQueue workersBuilds.worker' with id 'sub-123'."
			`);
		});

		it("should create subscription with custom name and disabled state", async () => {
			const queueNameResolveRequest = mockGetQueueByNameRequest(
				expectedQueueName,
				{
					queue_id: expectedQueueId,
					queue_name: expectedQueueName,
					created_on: "",
					producers: [],
					consumers: [],
					producers_total_count: 0,
					consumers_total_count: 0,
					modified_on: "",
				}
			);

			const expectedRequest: Partial<CreateEventSubscriptionRequest> = {
				name: "Custom Subscription",
				enabled: false,
				source: {
					type: EventSourceType.WORKERS_BUILDS_WORKER,
					worker_name: "my-worker",
				},
				events: ["build.completed"],
			};

			const createRequest = mockCreateSubscriptionRequest(
				expectedRequest,
				expectedQueueId
			);

			await runWrangler(
				"queues subscription create testQueue --source workersBuilds.worker --events build.completed --worker-name my-worker --name 'Custom Subscription' --enabled false"
			);

			expect(queueNameResolveRequest.count).toEqual(1);
			expect(createRequest.count).toEqual(1);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"Creating event subscription for queue 'testQueue'...
				✨ Successfully created event subscription 'Custom Subscription' with id 'sub-123'."
			`);
		});

		it("should show error when worker-name is missing for workersBuilds.worker source", async () => {
			await expect(
				runWrangler(
					"queues subscription create testQueue --source workersBuilds.worker --events build.completed"
				)
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: --worker-name is required when using source 'workersBuilds.worker']`
			);
		});

		it("should show error for invalid source type", async () => {
			await expect(
				runWrangler(
					"queues subscription create testQueue --source invalid --events test"
				)
			).rejects.toThrowErrorMatchingInlineSnapshot(`
				[Error: Invalid values:
				  Argument: source, Given: "invalid", Choices: "kv", "r2", "superSlurper", "vectorize", "workersAi.model", "workersBuilds.worker", "workflows.workflow"]
			`);
		});

		it("should show error when no events are provided", async () => {
			await expect(
				runWrangler(
					"queues subscription create testQueue --source workersBuilds.worker --events '' --worker-name my-worker"
				)
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: No events specified. Use --events to provide a comma-separated list of event types to subscribe to. For a complete list of sources and corresponding events, please refer to: https://developers.cloudflare.com/queues/event-subscriptions/events-schemas/]`
			);
		});

		it("should show error when queue does not exist", async () => {
			const queueNameResolveRequest = mockGetQueueByNameRequest(
				"nonexistent",
				null
			);

			await expect(
				runWrangler(
					"queues subscription create nonexistent --source workersBuilds.worker --events build.completed --worker-name my-worker"
				)
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Queue "nonexistent" does not exist. To create it, run: wrangler queues create nonexistent]`
			);

			expect(queueNameResolveRequest.count).toEqual(1);
		});
	});

	describe("list", () => {
		it("should show the correct help text", async () => {
			await runWrangler("queues subscription list --help");
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"wrangler queues subscription list <queue>

				List event subscriptions for a queue

				POSITIONALS
				  queue  The name of the queue to list subscriptions for  [string] [required]

				GLOBAL FLAGS
				  -c, --config    Path to Wrangler configuration file  [string]
				      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
				  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
				  -h, --help      Show help  [boolean]
				  -v, --version   Show version number  [boolean]

				OPTIONS
				      --page      Page number for pagination  [number] [default: 1]
				      --per-page  Number of subscriptions per page  [number] [default: 20]
				      --json      Output in JSON format  [boolean] [default: false]"
			`);
		});

		it("should show message when no subscriptions exist", async () => {
			const queueNameResolveRequest = mockGetQueueByNameRequest(
				expectedQueueName,
				{
					queue_id: expectedQueueId,
					queue_name: expectedQueueName,
					created_on: "",
					producers: [],
					consumers: [],
					producers_total_count: 0,
					consumers_total_count: 0,
					modified_on: "",
				}
			);

			const listRequest = mockListSubscriptionsRequest(expectedQueueId, []);

			await runWrangler("queues subscription list testQueue");

			expect(queueNameResolveRequest.count).toEqual(1);
			expect(listRequest.count).toEqual(1);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"No event subscriptions found for queue 'testQueue'."
			`);
		});

		it("should list subscriptions for a queue", async () => {
			const queueNameResolveRequest = mockGetQueueByNameRequest(
				expectedQueueName,
				{
					queue_id: expectedQueueId,
					queue_name: expectedQueueName,
					created_on: "",
					producers: [],
					consumers: [],
					producers_total_count: 0,
					consumers_total_count: 0,
					modified_on: "",
				}
			);

			const listRequest = mockListSubscriptionsRequest(expectedQueueId, [
				mockSubscription1,
				mockSubscription2,
			]);

			await runWrangler("queues subscription list testQueue");

			expect(queueNameResolveRequest.count).toEqual(1);
			expect(listRequest.count).toEqual(1);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"Event subscriptions for queue 'testQueue':
				┌─┬─┬─┬─┬─┬─┐
				│ ID │ Name │ Source │ Events │ Resource │ Enabled │
				├─┼─┼─┼─┼─┼─┤
				│ sub-123 │ Test Subscription 1 │ workersBuilds.worker │ build.completed, build.failed │ my-worker │ Yes │
				├─┼─┼─┼─┼─┼─┤
				│ sub-456 │ Test Subscription 2 │ kv │ namespace.created │ │ No │
				└─┴─┴─┴─┴─┴─┘"
			`);
		});

		it("should show error when queue does not exist", async () => {
			const queueNameResolveRequest = mockGetQueueByNameRequest(
				"nonexistent",
				null
			);

			await expect(
				runWrangler("queues subscription list nonexistent")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Queue "nonexistent" does not exist. To create it, run: wrangler queues create nonexistent]`
			);

			expect(queueNameResolveRequest.count).toEqual(1);
		});
	});

	describe("get", () => {
		it("should show the correct help text", async () => {
			await runWrangler("queues subscription get --help");
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"wrangler queues subscription get <queue>

				Get details about a specific event subscription

				POSITIONALS
				  queue  The name of the queue  [string] [required]

				GLOBAL FLAGS
				  -c, --config    Path to Wrangler configuration file  [string]
				      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
				  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
				  -h, --help      Show help  [boolean]
				  -v, --version   Show version number  [boolean]

				OPTIONS
				      --id    The ID of the subscription to retrieve  [string] [required]
				      --json  Output in JSON format  [boolean] [default: false]"
			`);
		});

		it("should get a subscription by ID", async () => {
			mockGetQueueByNameRequest("testQueue", {
				queue_id: expectedQueueId,
				queue_name: "testQueue",
				created_on: "",
				modified_on: "",
				producers: [],
				consumers: [],
				producers_total_count: 0,
				consumers_total_count: 0,
			});
			const getRequest = mockGetSubscriptionRequest(
				"sub-123",
				mockSubscription1
			);

			await runWrangler("queues subscription get testQueue --id sub-123");

			expect(getRequest.count).toEqual(1);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"ID:           sub-123
				Name:         Test Subscription 1
				Source:       workersBuilds.worker
				Resource:     my-worker
				Queue ID:     queueId
				Events:       build.completed, build.failed
				Enabled:      Yes
				Created At:   1/1/2024, 12:00:00 AM
				Modified At:  1/1/2024, 12:00:00 AM"
			`);
		});

		it("should show error when subscription does not exist", async () => {
			const getRequest = mockGetSubscriptionRequest("nonexistent-id", null);

			await expect(
				runWrangler("queues subscription get testQueue --id nonexistent-id")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[APIError: A request to the Cloudflare API (/accounts/some-account-id/event_subscriptions/subscriptions/nonexistent-id) failed.]`
			);

			expect(getRequest.count).toEqual(1);
		});
	});

	describe("delete", () => {
		const { setIsTTY } = useMockIsTTY();

		it("should show the correct help text", async () => {
			await runWrangler("queues subscription delete --help");
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"wrangler queues subscription delete <queue>

				Delete an event subscription from a queue

				POSITIONALS
				  queue  The name of the queue  [string] [required]

				GLOBAL FLAGS
				  -c, --config    Path to Wrangler configuration file  [string]
				      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
				  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
				  -h, --help      Show help  [boolean]
				  -v, --version   Show version number  [boolean]

				OPTIONS
				      --id     The ID of the subscription to delete  [string] [required]
				  -y, --force  Skip confirmation  [boolean] [default: false]"
			`);
		});

		it("should delete a subscription after confirmation", async () => {
			mockGetQueueByNameRequest("testQueue", {
				queue_id: expectedQueueId,
				queue_name: "testQueue",
				created_on: "",
				modified_on: "",
				producers: [],
				consumers: [],
				producers_total_count: 0,
				consumers_total_count: 0,
			});
			const getRequest = mockGetSubscriptionRequest(
				"sub-123",
				mockSubscription1
			);
			const deleteRequest = mockDeleteSubscriptionRequest("sub-123");

			setIsTTY(true);
			mockConfirm({
				text: "Are you sure you want to delete the event subscription 'Test Subscription 1' (sub-123)?",
				result: true,
			});

			await runWrangler("queues subscription delete testQueue --id sub-123");

			expect(getRequest.count).toEqual(1);
			expect(deleteRequest.count).toEqual(1);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"✨ Successfully deleted event subscription 'Test Subscription 1' with id 'sub-123'."
			`);
		});

		it("should delete subscription without confirmation when --force is used", async () => {
			mockGetQueueByNameRequest("testQueue", {
				queue_id: expectedQueueId,
				queue_name: "testQueue",
				created_on: "",
				modified_on: "",
				producers: [],
				consumers: [],
				producers_total_count: 0,
				consumers_total_count: 0,
			});
			const getRequest = mockGetSubscriptionRequest(
				"sub-123",
				mockSubscription1
			);
			const deleteRequest = mockDeleteSubscriptionRequest("sub-123");

			await runWrangler(
				"queues subscription delete testQueue --id sub-123 --force"
			);

			expect(getRequest.count).toEqual(1);
			expect(deleteRequest.count).toEqual(1);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"✨ Successfully deleted event subscription 'Test Subscription 1' with id 'sub-123'."
			`);
		});

		it("should show error when subscription does not exist", async () => {
			const getRequest = mockGetSubscriptionRequest("nonexistent-id", null);
			const deleteRequest = mockDeleteSubscriptionRequest("nonexistent-id");

			await expect(
				runWrangler("queues subscription delete testQueue --id nonexistent-id")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[APIError: A request to the Cloudflare API (/accounts/some-account-id/event_subscriptions/subscriptions/nonexistent-id) failed.]`
			);

			expect(getRequest.count).toEqual(1);
			expect(deleteRequest.count).toEqual(0); // Should not call delete if get fails
		});
	});

	describe("update", () => {
		it("should update subscription with multiple fields", async () => {
			const subscriptionId = "subscription-123";
			mockGetQueueByNameRequest("test-queue", {
				queue_id: "queue-id-1",
				queue_name: "test-queue",
				created_on: "",
				modified_on: "",
				producers: [],
				consumers: [],
				producers_total_count: 0,
				consumers_total_count: 0,
			});
			const requests = mockUpdateSubscriptionRequest(subscriptionId, {
				name: "new-name",
				events: ["build.completed", "build.failed"],
				enabled: false,
			});
			mockGetSubscriptionRequest(subscriptionId, {
				id: subscriptionId,
				name: "old-subscription",
				source: {
					type: EventSourceType.WORKERS_BUILDS_WORKER,
					worker_name: "my-worker",
				},
				destination: {
					type: "queues.queue",
					queue_id: "queue-id-1",
				},
				events: ["build.completed"],
				enabled: true,
				created_at: "2023-01-01T00:00:00.000Z",
				modified_at: "2023-01-01T00:00:00.000Z",
			});

			await runWrangler(
				`queues subscription update test-queue --id ${subscriptionId} --name new-name --events "build.completed,build.failed" --enabled false`
			);

			expect(requests.count).toBe(1);
			expect(std.out).toMatchInlineSnapshot(`
				"Updating event subscription...
				✨ Successfully updated event subscription 'updated-subscription' with id 'subscription-123'."
			`);
		});

		it("should error when no fields provided", async () => {
			const subscriptionId = "subscription-123";
			mockGetQueueByNameRequest("test-queue", {
				queue_id: "queue-id-1",
				queue_name: "test-queue",
				created_on: "",
				modified_on: "",
				producers: [],
				consumers: [],
				producers_total_count: 0,
				consumers_total_count: 0,
			});
			mockGetSubscriptionRequest(subscriptionId, {
				id: subscriptionId,
				name: "old-subscription",
				source: {
					type: EventSourceType.WORKERS_BUILDS_WORKER,
					worker_name: "my-worker",
				},
				destination: {
					type: "queues.queue",
					queue_id: "queue-id-1",
				},
				events: ["build.completed"],
				enabled: true,
				created_at: "2023-01-01T00:00:00.000Z",
				modified_at: "2023-01-01T00:00:00.000Z",
			});

			await expect(
				runWrangler(
					`queues subscription update test-queue --id ${subscriptionId}`
				)
			).rejects.toThrowError(
				"No fields specified for update. Provide at least one of --name, --events, or --enabled to update the subscription."
			);
		});
	});
});
