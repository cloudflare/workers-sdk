import { http, HttpResponse } from "msw";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { ProductSpec } from "../event-subscriptions/products";

const testAccountId = "some-account-id";

describe("wrangler", () => {
	mockAccountId({ accountId: testAccountId });
	mockApiToken();
	runInTempDir();

	const std = mockConsoleMethods();

	const { setIsTTY } = useMockIsTTY();
	beforeEach(() => {
		setIsTTY(true);

		// Set up a couple of fake products for tests
		vi.mock("../event-subscriptions/products.ts", () => ({
			PRODUCTS: [
				{
					id: "vitest",
					name: "Test Product",
					resource: { name: "Test" },
					subscription: {
						create: (_, { accountId, name, resourceId, queueId, events }) => {
							expect(accountId).toBe(testAccountId);
							expect(name).toBeDefined();
							expect(resourceId).toBeDefined();
							expect(queueId).toBeDefined();
							expect(events).toBeDefined();
							expect(events.length).toBeGreaterThan(0);

							return Promise.resolve({ id: "test-subscription-id" });
						},
					},
				},
				{
					id: "vitestResourceless",
					name: "Test Product Resourceless",
					resource: null,
					subscription: {
						create: (_, { accountId, name, queueId, events }) => {
							expect(accountId).toBe(testAccountId);
							expect(name).toBeDefined();
							expect(queueId).toBeDefined();
							expect(events).toBeDefined();
							expect(events.length).toBeGreaterThan(0);

							return Promise.resolve({ id: "test-subscription-id" });
						},
					},
				},
			] satisfies ProductSpec[],
		}));
	});
	afterEach(() => {
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
									id: "vitest",
									events: [
										{ name: "v-e-1", description: "Test event 1" },
										{ name: "v-e-2", description: "Test event 2" },
									],
								},
								{
									id: "vitestResourceless",
									events: [
										{ name: "vr-e-1", description: "Test event 1" },
										{ name: "vr-e-2", description: "Test event 2" },
									],
								},
							],
						});
					},
					{ once: true }
				)
			);

			const result = runWrangler("event-subscriptions browse");

			await expect(result).resolves.toBeUndefined();
			expect(std.out).toMatchSnapshot();
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
									id: "vitest",
									events: [
										{ name: "event-1", description: "Test event 1" },
										{ name: "event-2", description: "Test event 2" },
									],
								},
							],
						});
					},
					{ once: true }
				)
			);

			const result = runWrangler("event-subscriptions browse");

			await expect(result).resolves.toBeUndefined();
			expect(std.out).toMatchSnapshot(); // Should not have the `vitestResourceless` products
		});

		test("can filter products with --source", async () => {
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
									id: "vitestResourceless",
									events: [
										{ name: "event-1", description: "Test event 1" },
										{ name: "event-2", description: "Test event 2" },
									],
								},
							],
						});
					},
					{ once: true }
				)
			);

			const result = runWrangler(
				"event-subscriptions browse --source=vitestResourceless"
			);

			await expect(result).resolves.toBeUndefined();
			expect(std.out).toMatchSnapshot();
		});
	});

	describe("event-subscription create", async () => {
		test("creates a new subscription", async () => {
			const result = runWrangler(
				"event-subscriptions create test-subscription --source=vitest.testName --destination=queueId --events=e1,e2"
			);

			await expect(result).resolves.toBeUndefined();
			expect(std.out).toMatchSnapshot();
		});

		test("errors for unrecognized products", async () => {
			const result = runWrangler(
				"event-subscriptions create test-subscription --source=unrecognized.resourceId --destination=queueId --events=e1,e2"
			);

			await expect(result).rejects.toMatchSnapshot();
		});

		test("allows resource-less products without a resource ID", async () => {
			const result = runWrangler(
				"event-subscriptions create test-subscription --source=vitestResourceless --destination=queueId --events=e1,e2"
			);

			await expect(result).resolves.toBeUndefined();
			expect(std.out).toMatchSnapshot();
		});

		test("errors when resource ID is missing", async () => {
			const result = runWrangler(
				"event-subscriptions create test-subscription --source=vitest --destination=queueId --events=e1,e2"
			);

			await expect(result).rejects.toMatchSnapshot();
		});
	});

	test("event-subscriptions list", async () => {
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
								product_id: "test-product-id",
								resource_id: "test-resource-id",
								queue_id: "test-queue-id",
								queue_name: "test-queue-id",
								events: ["e1", "e2"],
							},
							{
								id: "test-subscription-id-2",
								name: "test-subscription-2",
								product_id: "test-product-id-2",
								resource_id: "test-resource-id-2",
								queue_id: "test-queue-id-2",
								queue_name: "test-queue-id-2",
								events: ["e3", "e4"],
							},
						],
					});
				},
				{ once: true }
			)
		);

		const result = runWrangler("event-subscriptions list");
		await expect(result).resolves.toBeUndefined();
		expect(std.out).toMatchSnapshot();
	});

	test("event-subscriptions get", async () => {
		msw.use(
			http.get(
				"*/accounts/:accountId/event_subscriptions/subscriptions/test-subscription-id",
				async ({ params }) => {
					expect(params.accountId).toEqual(testAccountId);
					return HttpResponse.json({
						success: true,
						errors: [],
						result: {
							id: "test-subscription-id",
							name: "test-subscription",
							product_id: "test-product-id",
							resource_id: "test-resource-id",
							queue_id: "test-queue-id",
							queue_name: "test-queue-id",
							events: ["e1", "e2"],
						},
					});
				},
				{ once: true }
			)
		);

		const result = runWrangler("event-subscriptions get test-subscription-id");
		await expect(result).resolves.toBeUndefined();
		expect(std.out).toMatchSnapshot();
	});

	test("event-subscriptions update", async () => {
		msw.use(
			http.patch(
				"*/accounts/:accountId/event_subscriptions/subscriptions/:subscriptionId",
				async ({ params, request }) => {
					expect(params.accountId).toEqual(testAccountId);
					expect(params.subscriptionId).toEqual("test-subscription-id");
					expect(await request.json()).toEqual({
						name: "updated",
						events: ["e1", "e2"],
					});

					return HttpResponse.json({
						success: true,
						errors: [],
						result: {
							id: "test-subscription-id",
							name: "updated",
							product_id: "test-product-id",
							resource_id: "test-resource-id",
							queue_id: "test-queue-id",
							queue_name: "test-queue-id",
							events: ["e1", "e2"],
						},
					});
				},
				{ once: true }
			)
		);

		const result = runWrangler(
			"event-subscriptions update test-subscription-id --name=updated --events=e1,e2"
		);
		await expect(result).resolves.toBeUndefined();
		expect(std.out).toMatchSnapshot();
	});

	test("event-subscriptions delete", async () => {
		msw.use(
			http.delete(
				"*/accounts/:accountId/event_subscriptions/subscriptions/:subscriptionId",
				async ({ params }) => {
					expect(params.accountId).toEqual(testAccountId);
					expect(params.subscriptionId).toEqual("test-subscription-id");

					return HttpResponse.json({
						success: true,
						errors: [],
						result: {},
					});
				},
				{ once: true }
			)
		);

		const result = runWrangler(
			"event-subscriptions delete test-subscription-id"
		);
		await expect(result).resolves.toBeUndefined();
		expect(std.out).toMatchSnapshot();
	});
});
