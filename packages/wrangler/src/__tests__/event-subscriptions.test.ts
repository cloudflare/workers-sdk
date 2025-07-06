import { http, HttpResponse } from "msw";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

const testAccountId = "some-account-id";

describe("wrangler event-subscriptions", () => {
	mockAccountId({ accountId: testAccountId });
	mockApiToken();
	runInTempDir();

	const std = mockConsoleMethods();

	const { setIsTTY } = useMockIsTTY();
	beforeEach(() => {
		setIsTTY(true);
	});

	afterEach(() => {
		msw.restoreHandlers();
		vi.restoreAllMocks();
		clearDialogs();
	});

	describe("event-subscription browse", async () => {
		test("shows all defined product events", async () => {
			msw.use(
				http.get(
					"*/accounts/:accountId/event_subscriptions/events",
					async ({ params }) => {
						expect(params.accountId).toEqual(testAccountId);
						return HttpResponse.json({
							success: true,
							errors: [],
							result: [
								{
									id: "slurper",
									name: "Super Slurper",
									events: [{ name: "e1" }, { name: "e2" }],
								},
								{
									id: "workflows",
									name: "Workflows",
									events: [{ name: "e10" }, { name: "e20" }],
								},
							],
						});
					},
					{ once: true }
				)
			);

			const result = runWrangler("event-subscriptions browse");

			await expect(result).resolves.toBeUndefined();
			expect(std.out).toMatchInlineSnapshot(`
				"┌─┬─┐
				│ service │ events │
				├─┼─┤
				│ Workflows │ e10, e20 │
				└─┴─┘"
			`);
		});

		test("ignores products that do not exist on both QBW and Wrangler", async () => {
			msw.use(
				http.get(
					"*/accounts/:accountId/event_subscriptions/events",
					async ({ params }) => {
						expect(params.accountId).toEqual(testAccountId);
						return HttpResponse.json({
							success: true,
							errors: [],
							result: [
								{
									id: "workflows",
									name: "Workflows",
									events: [{ name: "e10" }, { name: "e20" }],
								},
							],
						});
					},
					{ once: true }
				)
			);

			const result = runWrangler("event-subscriptions browse");

			await expect(result).resolves.toBeUndefined();
			expect(std.out).toMatchInlineSnapshot(`
				"┌─┬─┐
				│ service │ events │
				├─┼─┤
				│ Workflows │ e10, e20 │
				└─┴─┘"
			`);
		});

		test("can filter product ids with --source", async () => {
			msw.use(
				http.get(
					"*/accounts/:accountId/event_subscriptions/events",
					async ({ params }) => {
						expect(params.accountId).toEqual(testAccountId);
						return HttpResponse.json({
							success: true,
							errors: [],
							result: [
								{ id: "slurper", name: "Super Slurper", events: [] },
								{ id: "workflows", name: "Workflows", events: [] },
							],
						});
					},
					{ once: true }
				)
			);

			const result = runWrangler("event-subscriptions browse --source=slurp");

			await expect(result).resolves.toBeUndefined();
			expect(std.out).toMatchInlineSnapshot(`
				"┌─┬─┐
				│ service │ events │
				├─┼─┤
				│ │ │
				└─┴─┘"
			`);
		});

		test("can filter multiple product ids with --source", async () => {
			msw.use(
				http.get(
					"*/accounts/:accountId/event_subscriptions/events",
					async ({ params }) => {
						expect(params.accountId).toEqual(testAccountId);
						return HttpResponse.json({
							success: true,
							errors: [],
							result: [
								{ id: "slurper", name: "Super Slurper", events: [] },
								{ id: "workflows", name: "Workflows", events: [] },
								{ id: "workersAI", name: "Workers AI", events: [] },
							],
						});
					},
					{ once: true }
				)
			);

			const result = runWrangler(
				"event-subscriptions browse --source=slurp,workfl"
			);

			await expect(result).resolves.toBeUndefined();
			expect(std.out).toMatchInlineSnapshot(`
				"┌─┬─┐
				│ service │ events │
				├─┼─┤
				│ │ │
				└─┴─┘"
			`);
		});

		test("can filter product names with --source", async () => {
			msw.use(
				http.get(
					"*/accounts/:accountId/event_subscriptions/events",
					async ({ params }) => {
						expect(params.accountId).toEqual(testAccountId);
						return HttpResponse.json({
							success: true,
							errors: [],
							result: [
								{ id: "slurper", name: "Super Slurper", events: [] },
								{ id: "workflows", name: "Workflows", events: [] },
							],
						});
					},
					{ once: true }
				)
			);

			const result = runWrangler("event-subscriptions browse --source=super");

			await expect(result).resolves.toBeUndefined();
			expect(std.out).toMatchInlineSnapshot(`
				"┌─┬─┐
				│ service │ events │
				├─┼─┤
				│ │ │
				└─┴─┘"
			`);
		});

		test("can filter multiple product names with --source", async () => {
			msw.use(
				http.get(
					"*/accounts/:accountId/event_subscriptions/events",
					async ({ params }) => {
						expect(params.accountId).toEqual(testAccountId);
						return HttpResponse.json({
							success: true,
							errors: [],
							result: [
								{ id: "slurper", name: "Super Slurper", events: [] },
								{ id: "workflows", name: "Workflows", events: [] },
								{ id: "workersAI", name: "Workers AI", events: [] },
							],
						});
					},
					{ once: true }
				)
			);

			const result = runWrangler(
				"event-subscriptions browse --source=super,ai"
			);

			await expect(result).resolves.toBeUndefined();
			expect(std.out).toMatchInlineSnapshot(`
				"┌─┬─┐
				│ service │ events │
				├─┼─┤
				│ │ │
				└─┴─┘"
			`);
		});
	});

	describe("event-subscriptions list", async () => {
		test("lists no subscriptions", async () => {
			msw.use(
				http.get(
					"*/accounts/:accountId/event_subscriptions/subscriptions",
					async ({ params }) => {
						expect(params.accountId).toEqual(testAccountId);
						return HttpResponse.json({
							success: true,
							errors: [],
							result: [],
						});
					},
					{ once: true }
				)
			);

			const result = runWrangler("event-subscriptions list");
			await expect(result).resolves.toBeUndefined();
			expect(std.out).toMatchInlineSnapshot(`
				"┌─┬─┬─┬─┬─┐
				│ id │ name │ source │ destination │ events │
				├─┼─┼─┼─┼─┤
				│ │ │ │ │ │
				└─┴─┴─┴─┴─┘"
			`);
		});

		test("lists all subscriptions", async () => {
			msw.use(
				http.get(
					"*/accounts/:accountId/event_subscriptions/subscriptions",
					async ({ params }) => {
						expect(params.accountId).toEqual(testAccountId);
						return HttpResponse.json({
							success: true,
							errors: [],
							result: [
								{
									id: "test-subscription-id-1",
									name: "test-subscription-1",
									enabled: true,
									source: { service: "slurper" },
									destination: { service: "queues", queue_id: "test-queue-id" },
									events: ["e1", "e2"],
								},
								{
									id: "test-subscription-id-2",
									name: "test-subscription-2",
									enabled: true,
									source: {
										service: "workflows",
										workflow_name: "test-workflow-name",
									},
									destination: { service: "queues", queue_id: "test-queue-id" },
									events: ["e1", "e2"],
								},
							],
						});
					},
					{ once: true }
				)
			);

			const result = runWrangler("event-subscriptions list");
			await expect(result).resolves.toBeUndefined();
			expect(std.out).toMatchInlineSnapshot(`
				"┌─┬─┬─┬─┬─┐
				│ id │ name │ source │ destination │ events │
				├─┼─┼─┼─┼─┤
				│ test-subscription-id-1 │ test-subscription-1 │ {\\"service\\":\\"slurper\\"} │ queues.test-queue-id │ e1, e2 │
				├─┼─┼─┼─┼─┤
				│ test-subscription-id-2 │ test-subscription-2 │ workflows.test-workflow-name │ queues.test-queue-id │ e1, e2 │
				└─┴─┴─┴─┴─┘"
			`);
		});

		test("can handle subscriptions for unknown products", async () => {
			msw.use(
				http.get(
					"*/accounts/:accountId/event_subscriptions/subscriptions",
					async ({ params }) => {
						expect(params.accountId).toEqual(testAccountId);
						return HttpResponse.json({
							success: true,
							errors: [],
							result: [
								{
									id: "test-subscription-id",
									name: "test-subscription",
									enabled: true,
									source: { service: "workersKV", namespace: "test-namespace" },
									destination: { service: "queues", queue_id: "test-queue-id" },
									events: ["e1", "e2"],
								},
							],
						});
					},
					{ once: true }
				)
			);

			const result = runWrangler("event-subscriptions list");
			await expect(result).resolves.toBeUndefined();
			expect(std.out).toMatchInlineSnapshot(`
				"┌─┬─┬─┬─┬─┐
				│ id │ name │ source │ destination │ events │
				├─┼─┼─┼─┼─┤
				│ test-subscription-id │ test-subscription │ {\\"service\\":\\"workersKV\\",\\"namespace\\":\\"test-namespace\\"} │ queues.test-queue-id │ e1, e2 │
				└─┴─┴─┴─┴─┘"
			`);
		});
	});

	describe("event-subscriptions get", async () => {
		test("gets a single subscription", async () => {
			msw.use(
				http.get(
					"*/accounts/:accountId/event_subscriptions/subscriptions/:subscriptionId",
					async ({ params }) => {
						expect(params.accountId).toEqual(testAccountId);
						expect(params.subscriptionId).toEqual("test-subscription-id");
						return HttpResponse.json({
							success: true,
							errors: [],
							result: {
								id: "test-subscription-id-1",
								name: "test-subscription-1",
								enabled: true,
								source: { service: "slurper" },
								destination: { service: "queues", queue_id: "test-queue-id" },
								events: ["e1", "e2"],
							},
						});
					},
					{ once: true }
				)
			);

			const result = runWrangler(
				"event-subscriptions get test-subscription-id"
			);
			await expect(result).resolves.toBeUndefined();
			expect(std.out).toMatchInlineSnapshot(`
				"┌─┬─┬─┬─┬─┐
				│ id │ name │ source │ destination │ events │
				├─┼─┼─┼─┼─┤
				│ test-subscription-id-1 │ test-subscription-1 │ {\\"service\\":\\"slurper\\"} │ queues.test-queue-id │ e1, e2 │
				└─┴─┴─┴─┴─┘"
			`);
		});

		test("errors if the subscription with the given ID does not exist", async () => {
			msw.use(
				http.get(
					"*/accounts/:accountId/event_subscriptions/subscriptions/:subscriptionId",
					async ({ params }) => {
						expect(params.accountId).toEqual(testAccountId);
						expect(params.subscriptionId).toEqual("test-subscription-id");
						return HttpResponse.json(
							{
								success: false,
								errors: [{ message: "No subscription with this ID" }],
								result: {},
							},
							{ status: 404 }
						);
					},
					{ once: true }
				)
			);

			const result = runWrangler(
				"event-subscriptions get test-subscription-id"
			);
			await expect(result).rejects.toMatchInlineSnapshot(
				`[APIError: A request to the Cloudflare API (/accounts/some-account-id/event_subscriptions/subscriptions/test-subscription-id) failed.]`
			);
			expect(std.out).toMatch(new RegExp(/No subscription with this ID/));
		});

		test("can handle subscriptions for unknown products", async () => {
			msw.use(
				http.get(
					"*/accounts/:accountId/event_subscriptions/subscriptions/:subscriptionId",
					async ({ params }) => {
						expect(params.accountId).toEqual(testAccountId);
						expect(params.subscriptionId).toEqual("test-subscription-id");
						return HttpResponse.json({
							success: true,
							errors: [],
							result: {
								id: "test-subscription-id",
								name: "test-subscription",
								enabled: true,
								source: { service: "workersKV", namespace: "test-namespace" },
								destination: { service: "queues", queue_id: "test-queue-id" },
								events: ["e1", "e2"],
							},
						});
					},
					{ once: true }
				)
			);

			const result = runWrangler(
				"event-subscriptions get test-subscription-id"
			);
			await expect(result).resolves.toBeUndefined();
			expect(std.out).toMatchInlineSnapshot(`
				"┌─┬─┬─┬─┬─┐
				│ id │ name │ source │ destination │ events │
				├─┼─┼─┼─┼─┤
				│ test-subscription-id │ test-subscription │ {\\"service\\":\\"workersKV\\",\\"namespace\\":\\"test-namespace\\"} │ queues.test-queue-id │ e1, e2 │
				└─┴─┴─┴─┴─┘"
			`);
		});
	});

	describe("event-subscription create", async () => {
		test("creates a new subscription", async () => {
			msw.use(
				http.post(
					"*/accounts/:accountId/event_subscriptions/subscriptions",
					async ({ params }) => {
						expect(params.accountId).toEqual(testAccountId);
						return HttpResponse.json({
							success: true,
							errors: [],
							result: {
								id: "test-subscription-id-1",
								name: "test-subscription-1",
								enabled: true,
								source: { service: "superSlurper" },
								destination: { service: "queues", queue_id: "test-queue-id" },
								events: ["e1", "e2"],
							},
						});
					},
					{ once: true }
				)
			);
			await runWrangler(
				"event-subscriptions create test-subscription --source=superSlurper --destination=queues.queueId --events=e1,e2"
			);

			expect(std.out).toMatchInlineSnapshot(`
				"┌─┬─┬─┬─┬─┐
				│ id │ name │ source │ destination │ events │
				├─┼─┼─┼─┼─┤
				│ test-subscription-id-1 │ test-subscription-1 │ superSlurper │ queues.test-queue-id │ e1,e2 │
				└─┴─┴─┴─┴─┘"
			`);
		});

		test("errors for unrecognized sources", async () => {
			const result = runWrangler(
				"event-subscriptions create test-subscription --source=unrecognized.resourceId --destination=queues.queueId --events=e1,e2"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: Unrecognized source service. Must be one of superSlurper, workersAI, workersBuilds, workflows]`
			);
		});

		test("errors for malformed sources", async () => {
			const result = runWrangler(
				"event-subscriptions create test-subscription --source=workflows --destination=queues.queueId --events=e1,e2"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: Invalid source. Must be formatted as workflows.<workflow_id>]`
			);
		});

		test("errors for unrecognized destinations", async () => {
			const result = runWrangler(
				"event-subscriptions create test-subscription --source=superSlurper --destination=unrecognized --events=e1,e2"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: Invalid destination. Must be formatted as queues.<queue_id>]`
			);
		});

		test("errors for malformed destinations", async () => {
			const result = runWrangler(
				"event-subscriptions create test-subscription --source=superSlurper --destination=queues --events=e1,e2"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: Invalid destination. Must be formatted as queues.<queue_id>]`
			);
		});

		test("errors for unrecognized events", async () => {
			msw.use(
				http.post(
					"*/accounts/:accountId/event_subscriptions/subscriptions",
					async ({ params }) => {
						expect(params.accountId).toEqual(testAccountId);
						return HttpResponse.json(
							{
								success: false,
								errors: [
									{
										message: "Invalid event name",
									},
								],
							},
							{ status: 400 }
						);
					},
					{ once: true }
				)
			);
			const result = runWrangler(
				"event-subscriptions create test-subscription --source=superSlurper --destination=queues.queueID --events=e1,e2"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[APIError: A request to the Cloudflare API (/accounts/some-account-id/event_subscriptions/subscriptions) failed.]`
			);
			expect(std.out).toMatch(new RegExp(/Invalid event name/));
		});
	});

	describe("event-subscriptions update", async () => {
		test("can update a subscription's name", async () => {
			msw.use(
				http.patch(
					"*/accounts/:accountId/event_subscriptions/subscriptions/:subscriptionId",
					async ({ params, request }) => {
						expect(params.accountId).toEqual(testAccountId);
						expect(params.subscriptionId).toEqual("test-subscription-id");
						expect(await request.json()).toEqual({ name: "updated" });

						return HttpResponse.json({
							success: true,
							errors: [],
							result: {
								id: "test-subscription-id",
								name: "updated",
								enabled: true,
								source: { service: "slurper" },
								destination: { service: "queues", queue_id: "test-queue-id" },
								events: ["e1", "e2"],
							},
						});
					},
					{ once: true }
				)
			);

			const result = runWrangler(
				"event-subscriptions update test-subscription-id --name=updated"
			);
			await expect(result).resolves.toBeUndefined();
			expect(std.out).toMatchInlineSnapshot(`
				"┌─┬─┬─┬─┬─┐
				│ id │ name │ source │ destination │ events │
				├─┼─┼─┼─┼─┤
				│ test-subscription-id │ updated │ {\\"service\\":\\"slurper\\"} │ queues.test-queue-id │ e1, e2 │
				└─┴─┴─┴─┴─┘"
			`);
		});

		test("can update a subscription's destination", async () => {
			msw.use(
				http.patch(
					"*/accounts/:accountId/event_subscriptions/subscriptions/:subscriptionId",
					async ({ params, request }) => {
						expect(params.accountId).toEqual(testAccountId);
						expect(params.subscriptionId).toEqual("test-subscription-id");
						expect(await request.json()).toEqual({
							destination: { service: "queues", queue_id: "updated" },
						});

						return HttpResponse.json({
							success: true,
							errors: [],
							result: {
								id: "test-subscription-id",
								name: "updated",
								enabled: true,
								source: { service: "slurper" },
								destination: { service: "queues", queue_id: "updated" },
								events: ["e1", "e2"],
							},
						});
					},
					{ once: true }
				)
			);

			const result = runWrangler(
				"event-subscriptions update test-subscription-id --destination=queues.updated"
			);
			await expect(result).resolves.toBeUndefined();
			expect(std.out).toMatchInlineSnapshot(`
				"┌─┬─┬─┬─┬─┐
				│ id │ name │ source │ destination │ events │
				├─┼─┼─┼─┼─┤
				│ test-subscription-id │ updated │ {\\"service\\":\\"slurper\\"} │ queues.updated │ e1, e2 │
				└─┴─┴─┴─┴─┘"
			`);
		});

		test("can update a subscription's events", async () => {
			msw.use(
				http.patch(
					"*/accounts/:accountId/event_subscriptions/subscriptions/:subscriptionId",
					async ({ params, request }) => {
						expect(params.accountId).toEqual(testAccountId);
						expect(params.subscriptionId).toEqual("test-subscription-id");
						expect(await request.json()).toEqual({
							events: ["e2"],
						});

						return HttpResponse.json({
							success: true,
							errors: [],
							result: {
								id: "test-subscription-id",
								name: "updated",
								enabled: true,
								source: { service: "slurper" },
								destination: { service: "queues", queue_id: "updated" },
								events: ["e2"],
							},
						});
					},
					{ once: true }
				)
			);

			const result = runWrangler(
				"event-subscriptions update test-subscription-id --events=e2"
			);
			await expect(result).resolves.toBeUndefined();
			expect(std.out).toMatchInlineSnapshot(`
				"┌─┬─┬─┬─┬─┐
				│ id │ name │ source │ destination │ events │
				├─┼─┼─┼─┼─┤
				│ test-subscription-id │ updated │ {\\"service\\":\\"slurper\\"} │ queues.updated │ e2 │
				└─┴─┴─┴─┴─┘"
			`);
		});

		test("can handle unrecognized destinations", async () => {
			const result = runWrangler(
				"event-subscriptions update test-subscription-id --destination=unrecognized.updated"
			);
			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: Invalid destination. Must be formatted as queues.<queue_id>]`
			);
		});

		test("can handle malformed destinations", async () => {
			msw.use(
				http.patch(
					"*/accounts/:accountId/event_subscriptions/subscriptions/:subscriptionId",
					async ({ params, request }) => {
						expect(params.accountId).toEqual(testAccountId);
						expect(params.subscriptionId).toEqual("test-subscription-id");
						expect(await request.json()).toEqual({
							destination: { service: "queues", queue_id: "updated" },
						});

						return HttpResponse.json({
							success: true,
							errors: [],
							result: {
								id: "test-subscription-id",
								name: "updated",
								enabled: true,
								source: { service: "slurper" },
								destination: { service: "queues", queue_id: "updated" },
								events: ["e1", "e2"],
							},
						});
					},
					{ once: true }
				)
			);

			const result = runWrangler(
				"event-subscriptions update test-subscription-id --destination=queues"
			);
			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: Invalid destination. Must be formatted as queues.<queue_id>]`
			);
		});

		test("can handle unrecognized events", async () => {
			msw.use(
				http.patch(
					"*/accounts/:accountId/event_subscriptions/subscriptions/:subscriptionId",
					async ({ params, request }) => {
						expect(params.accountId).toEqual(testAccountId);
						expect(params.subscriptionId).toEqual("test-subscription-id");
						expect(await request.json()).toEqual({
							destination: { service: "queues", queue_id: "updated" },
						});

						return HttpResponse.json(
							{
								success: false,
								errors: [{ message: "Invalid event names" }],
							},
							{ status: 404 }
						);
					},
					{ once: true }
				)
			);

			const result = runWrangler(
				"event-subscriptions update test-subscription-id --destination=queues.updated"
			);
			await expect(result).rejects.toMatchInlineSnapshot(
				`[APIError: A request to the Cloudflare API (/accounts/some-account-id/event_subscriptions/subscriptions/test-subscription-id) failed.]`
			);
			expect(std.out).toMatch(new RegExp(/Invalid event names/));
		});

		test("errors if the subscription with the given ID does not exist", async () => {
			msw.use(
				http.patch(
					"*/accounts/:accountId/event_subscriptions/subscriptions/test-subscription-id",
					async ({ params }) => {
						expect(params.accountId).toEqual(testAccountId);
						return HttpResponse.json(
							{
								success: false,
								errors: [{ message: "No subscription with this ID" }],
								result: null,
							},
							{ status: 404 }
						);
					},
					{ once: true }
				)
			);

			const result = runWrangler(
				"event-subscriptions update test-subscription-id --name=updated"
			);
			await expect(result).rejects.toBeDefined();
			expect(std.out).toMatch(new RegExp(/No subscription with this ID/));
		});
	});

	describe("event-subscriptions delete", async () => {
		test("deletes a single subscription", async () => {
			msw.use(
				http.delete(
					"*/accounts/:accountId/event_subscriptions/subscriptions/:subscriptionId",
					async ({ params }) => {
						expect(params.accountId).toEqual(testAccountId);
						expect(params.subscriptionId).toEqual("test-subscription-id");
						return HttpResponse.json({
							success: true,
							errors: [],
							result: {
								id: "test-subscription-id",
								name: "test-subscription",
								enabled: true,
								source: { service: "slurper" },
								destination: { service: "queues", queue_id: "test-queue-id" },
								events: ["e1", "e2"],
							},
						});
					},
					{ once: true }
				)
			);

			const result = runWrangler(
				"event-subscriptions delete test-subscription-id"
			);
			await expect(result).resolves.toBeUndefined();
			expect(std.out).toMatchInlineSnapshot(`"Event subscription deleted!"`);
		});

		test("errors if the subscription with the given ID does not exist", async () => {
			msw.use(
				http.delete(
					"*/accounts/:accountId/event_subscriptions/subscriptions/test-subscription-id",
					async ({ params }) => {
						expect(params.accountId).toEqual(testAccountId);
						return HttpResponse.json(
							{
								success: false,
								errors: [{ message: "No subscription with this ID" }],
								result: null,
							},
							{ status: 404 }
						);
					},
					{ once: true }
				)
			);

			const result = runWrangler(
				"event-subscriptions delete test-subscription-id"
			);
			await expect(result).rejects.toMatchInlineSnapshot(
				`[APIError: A request to the Cloudflare API (/accounts/some-account-id/event_subscriptions/subscriptions/test-subscription-id) failed.]`
			);
			expect(std.out).toMatch(new RegExp(/No subscription with this ID/));
		});
	});
});
