import { http, HttpResponse } from "msw";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import { writeWranglerConfig } from "./helpers/write-wrangler-config";
import type { PostTypedConsumerBody, QueueResponse } from "../queues/client";

describe("wrangler", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const std = mockConsoleMethods();

	describe("queues", () => {
		const expectedQueueId = "queueId";
		const expectedConsumerId = "consumerId";
		const expectedQueueName = "testQueue";

		it("should show the correct help text", async () => {
			await runWrangler("queues --help");
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"wrangler queues

				🇶  Manage Workers Queues

				COMMANDS
				  wrangler queues list           List Queues
				  wrangler queues create <name>  Create a Queue
				  wrangler queues delete <name>  Delete a Queue
				  wrangler queues info <name>    Get Queue information
				  wrangler queues consumer       Configure Queue consumers

				GLOBAL FLAGS
				  -c, --config   Path to Wrangler configuration file  [string]
				  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				  -h, --help     Show help  [boolean]
				  -v, --version  Show version number  [boolean]"
			`);
		});

		function mockGetQueueByNameRequest(
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

		describe("list", () => {
			function mockListRequest(queues: QueueResponse[], page: number) {
				const requests = { count: 0 };
				msw.use(
					http.get(
						"*/accounts/:accountId/queues?*",
						async ({ request }) => {
							const url = new URL(request.url);

							requests.count += 1;
							const query = url.searchParams;
							expect(Number(query.get("page"))).toEqual(page);
							expect(await request.text()).toEqual("");
							return HttpResponse.json({
								success: true,
								errors: [],
								messages: [],
								result: queues,
							});
						},
						{ once: true }
					)
				);
				return requests;
			}

			it("should show the correct help text", async () => {
				await runWrangler("queues list --help");
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.out).toMatchInlineSnapshot(`
					"wrangler queues list

					List Queues

					GLOBAL FLAGS
					  -c, --config   Path to Wrangler configuration file  [string]
					  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					  -h, --help     Show help  [boolean]
					  -v, --version  Show version number  [boolean]

					OPTIONS
					      --page  Page number for pagination  [number]"
				`);
			});

			it("should list queues on page 1 with no --page", async () => {
				const expectedQueues: QueueResponse[] = [
					{
						queue_id: "5e1b9969eb974d8c99c48d19df104c7a",
						queue_name: "queue-1",
						created_on: "01-01-2001",
						modified_on: "01-01-2001",
						producers: [],
						producers_total_count: 0,
						consumers: [],
						consumers_total_count: 0,
						settings: {
							delivery_delay: 0,
						},
					},
					{
						queue_id: "def19fa3787741579c9088eb850474af",
						queue_name: "queue-2",
						created_on: "01-01-2001",
						modified_on: "01-01-2001",
						producers: [],
						producers_total_count: 0,
						consumers: [],
						consumers_total_count: 0,
						settings: {
							delivery_delay: 0,
						},
					},
				];
				const expectedPage = 1;
				mockListRequest(expectedQueues, expectedPage);
				await runWrangler("queues list");

				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.out).toMatchInlineSnapshot(`
			"┌──────────────────────────────────┬─────────┬────────────┬─────────────┬───────────┬───────────┐
			│ id                               │ name    │ created_on │ modified_on │ producers │ consumers │
			├──────────────────────────────────┼─────────┼────────────┼─────────────┼───────────┼───────────┤
			│ 5e1b9969eb974d8c99c48d19df104c7a │ queue-1 │ 01-01-2001 │ 01-01-2001  │ 0         │ 0         │
			├──────────────────────────────────┼─────────┼────────────┼─────────────┼───────────┼───────────┤
			│ def19fa3787741579c9088eb850474af │ queue-2 │ 01-01-2001 │ 01-01-2001  │ 0         │ 0         │
			└──────────────────────────────────┴─────────┴────────────┴─────────────┴───────────┴───────────┘"
		`);
			});

			it("should list queues using --page=2", async () => {
				const expectedQueues: QueueResponse[] = [
					{
						queue_id: "7f7c2df28cee49ad-bbb46c9e5426e850",
						queue_name: "queue-100",
						created_on: "01-01-2001",
						modified_on: "01-01-2001",
						producers: [],
						producers_total_count: 0,
						consumers: [],
						consumers_total_count: 0,
						settings: {
							delivery_delay: 0,
						},
					},
				];
				const expectedPage = 2;
				mockListRequest(expectedQueues, expectedPage);
				await runWrangler("queues list --page=2");

				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.out).toMatchInlineSnapshot(`
			"┌───────────────────────────────────┬───────────┬────────────┬─────────────┬───────────┬───────────┐
			│ id                                │ name      │ created_on │ modified_on │ producers │ consumers │
			├───────────────────────────────────┼───────────┼────────────┼─────────────┼───────────┼───────────┤
			│ 7f7c2df28cee49ad-bbb46c9e5426e850 │ queue-100 │ 01-01-2001 │ 01-01-2001  │ 0         │ 0         │
			└───────────────────────────────────┴───────────┴────────────┴─────────────┴───────────┴───────────┘"
		`);
			});
		});

		describe("create", () => {
			function mockCreateRequest(
				queueName: string,
				queueSettings: { delivery_delay?: number } | undefined = undefined
			) {
				const requests = { count: 0 };

				msw.use(
					http.post(
						"*/accounts/:accountId/queues",
						async ({ request }) => {
							requests.count += 1;

							const body = (await request.json()) as {
								queue_name: string;
								settings: {
									delivery_delay: number;
								};
							};
							expect(body.queue_name).toEqual(queueName);
							expect(body.settings).toEqual(queueSettings);
							return HttpResponse.json({
								success: true,
								errors: [],
								messages: [],
								result: {
									queue_name: queueName,
									created_on: "01-01-2001",
									modified_on: "01-01-2001",
								},
							});
						},
						{ once: true }
					)
				);
				return requests;
			}

			it("should show the correct help text", async () => {
				await runWrangler("queues create --help");
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.out).toMatchInlineSnapshot(`
					"wrangler queues create <name>

					Create a Queue

					POSITIONALS
					  name  The name of the queue  [string] [required]

					GLOBAL FLAGS
					  -c, --config   Path to Wrangler configuration file  [string]
					  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					  -h, --help     Show help  [boolean]
					  -v, --version  Show version number  [boolean]

					OPTIONS
					      --delivery-delay-secs  How long a published message should be delayed for, in seconds. Must be a positive integer  [number]"
				`);
			});
			describe.each(["wrangler.json", "wrangler.toml"])("%s", (configPath) => {
				it("should create a queue", async () => {
					writeWranglerConfig({}, configPath);
					const requests = mockCreateRequest("testQueue");
					await runWrangler("queues create testQueue");
					expect(std.out).toMatchSnapshot();
					expect(requests.count).toEqual(1);
				});

				it("should send queue settings with delivery delay", async () => {
					const requests = mockCreateRequest("testQueue", {
						delivery_delay: 10,
					});
					writeWranglerConfig({}, configPath);
					await runWrangler("queues create testQueue --delivery-delay-secs=10");
					expect(std.out).toMatchSnapshot();
					expect(requests.count).toEqual(1);
				});
			});

			it("should show link to dash when not enabled", async () => {
				const queueName = "testQueue";
				msw.use(
					http.post(
						"*/accounts/:accountId/queues",
						async ({ params }) => {
							expect(params.accountId).toEqual("some-account-id");
							return HttpResponse.json(
								{
									success: false,
									errors: [
										{
											message: "workers.api.error.unauthorized",
											code: 10023,
										},
									],
									messages: [],
								},
								{ status: 403 }
							);
						},
						{ once: true }
					)
				);

				await expect(
					runWrangler(`queues create ${queueName}`)
				).rejects.toThrowError();
				expect(std.out).toMatchInlineSnapshot(`
		"🌀 Creating queue 'testQueue'
		Queues is not currently enabled on this account. Go to https://dash.cloudflare.com/some-account-id/workers/queues to enable it.

		[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/some-account-id/queues) failed.[0m

		  workers.api.error.unauthorized [code: 10023]

		  If you think this is a bug, please open an issue at:
		  [4mhttps://github.com/cloudflare/workers-sdk/issues/new/choose[0m

		"
	`);
			});

			it("should show an error when two delivery delays are set", async () => {
				const requests = mockCreateRequest("testQueue", { delivery_delay: 0 });

				await expect(
					runWrangler(
						"queues create testQueue --delivery-delay-secs=5 --delivery-delay-secs=10"
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Cannot specify --delivery-delay-secs multiple times]`
				);

				expect(requests.count).toEqual(0);
			});
		});

		describe("delete", () => {
			function mockDeleteRequest(queueId: string) {
				const requests = { count: 0 };
				msw.use(
					http.delete(
						"*/accounts/:accountId/queues/:queueId",
						async ({ params }) => {
							requests.count += 1;
							expect(params.queueId).toEqual(queueId);
							expect(params.accountId).toEqual("some-account-id");
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

			it("should show the correct help text", async () => {
				await runWrangler("queues delete --help");
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.out).toMatchInlineSnapshot(`
					"wrangler queues delete <name>

					Delete a Queue

					POSITIONALS
					  name  The name of the queue  [string] [required]

					GLOBAL FLAGS
					  -c, --config   Path to Wrangler configuration file  [string]
					  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					  -h, --help     Show help  [boolean]
					  -v, --version  Show version number  [boolean]"
				`);
			});

			it("should delete a queue", async () => {
				const queueNameResolveRequest = mockGetQueueByNameRequest(
					expectedQueueName,
					{
						queue_id: expectedQueueId,
						queue_name: expectedQueueName,
						created_on: "",
						producers: [],
						consumers: [],
						producers_total_count: 1,
						consumers_total_count: 0,
						modified_on: "",
					}
				);

				const deleteRequest = mockDeleteRequest(expectedQueueId);
				await runWrangler("queues delete testQueue");
				expect(std.out).toMatchInlineSnapshot(`
					"Deleting queue testQueue.
					Deleted queue testQueue."
			  `);
				expect(queueNameResolveRequest.count).toEqual(1);
				expect(deleteRequest.count).toEqual(1);
			});

			it("should show error when a queue doesn't exist", async () => {
				const queueNameResolveRequest = mockGetQueueByNameRequest(
					expectedQueueName,
					null
				);

				const deleteRequest = mockDeleteRequest(expectedQueueId);
				await runWrangler();
				await expect(
					runWrangler("queues delete testQueue")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Queue "testQueue" does not exist. To create it, run: wrangler queues create testQueue]`
				);

				expect(queueNameResolveRequest.count).toEqual(1);
				expect(deleteRequest.count).toEqual(0);
			});
		});

		describe("consumers", () => {
			it("should show the correct help text", async () => {
				await runWrangler("queues consumer --help");

				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.out).toMatchInlineSnapshot(`
					"wrangler queues consumer

					Configure Queue consumers

					COMMANDS
					  wrangler queues consumer add <queue-name> <script-name>     Add a Queue Worker Consumer
					  wrangler queues consumer remove <queue-name> <script-name>  Remove a Queue Worker Consumer
					  wrangler queues consumer http                               Configure Queue HTTP Pull Consumers
					  wrangler queues consumer worker                             Configure Queue Worker Consumers

					GLOBAL FLAGS
					  -c, --config   Path to Wrangler configuration file  [string]
					  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					  -h, --help     Show help  [boolean]
					  -v, --version  Show version number  [boolean]"
				`);
			});

			describe("add", () => {
				function mockPostRequest(
					queueName: string,
					expectedBody: PostTypedConsumerBody
				) {
					const requests = { count: 0 };
					msw.use(
						http.post(
							"*/accounts/:accountId/queues/:queueName/consumers",
							async ({ request, params }) => {
								requests.count += 1;
								expect(params.queueName).toEqual(queueName);
								expect(params.accountId).toEqual("some-account-id");
								expect(await request.json()).toEqual(expectedBody);
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

				it("should show the correct help text", async () => {
					await runWrangler("queues consumer add --help");
					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(`
						"wrangler queues consumer add <queue-name> <script-name>

						Add a Queue Worker Consumer

						POSITIONALS
						  queue-name   Name of the queue to configure  [string] [required]
						  script-name  Name of the consumer script  [string] [required]

						GLOBAL FLAGS
						  -c, --config   Path to Wrangler configuration file  [string]
						  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
						  -h, --help     Show help  [boolean]
						  -v, --version  Show version number  [boolean]

						OPTIONS
						      --batch-size         Maximum number of messages per batch  [number]
						      --batch-timeout      Maximum number of seconds to wait to fill a batch with messages  [number]
						      --message-retries    Maximum number of retries for each message  [number]
						      --dead-letter-queue  Queue to send messages that failed to be consumed  [string]
						      --max-concurrency    The maximum number of concurrent consumer Worker invocations. Must be a positive integer  [number]
						      --retry-delay-secs   The number of seconds to wait before retrying a message  [number]"
					`);
				});

				it("should add a consumer using defaults", async () => {
					const queueNameResolveRequest = mockGetQueueByNameRequest(
						expectedQueueName,
						{
							queue_id: expectedQueueId,
							queue_name: expectedQueueName,
							created_on: "",
							producers: [],
							consumers: [],
							producers_total_count: 1,
							consumers_total_count: 0,
							modified_on: "",
						}
					);

					const expectedBody: PostTypedConsumerBody = {
						script_name: "testScript",
						type: "worker",
						environment_name: "",
						settings: {
							batch_size: undefined,
							max_retries: undefined,
							max_wait_time_ms: undefined,
							max_concurrency: undefined,
							retry_delay: undefined,
						},
						dead_letter_queue: undefined,
					};
					const postRequest = mockPostRequest(expectedQueueId, expectedBody);
					await runWrangler("queues consumer add testQueue testScript");

					expect(queueNameResolveRequest.count).toEqual(1);
					expect(postRequest.count).toEqual(1);

					expect(std.out).toMatchInlineSnapshot(`
							"Adding consumer to queue testQueue.
							Added consumer to queue testQueue."
					`);
				});

				it("should add a consumer using custom values", async () => {
					const queueNameResolveRequest = mockGetQueueByNameRequest(
						expectedQueueName,
						{
							queue_id: expectedQueueId,
							queue_name: expectedQueueName,
							created_on: "",
							producers: [],
							consumers: [],
							producers_total_count: 1,
							consumers_total_count: 0,
							modified_on: "",
						}
					);

					const expectedBody: PostTypedConsumerBody = {
						script_name: "testScript",
						type: "worker",
						environment_name: "myEnv",
						settings: {
							batch_size: 20,
							max_retries: 3,
							max_wait_time_ms: 10 * 1000,
							max_concurrency: 3,
							retry_delay: 10,
						},
						dead_letter_queue: "myDLQ",
					};
					const postRequest = mockPostRequest(expectedQueueId, expectedBody);

					await runWrangler(
						"queues consumer add testQueue testScript --env myEnv --batch-size 20 --batch-timeout 10 --message-retries 3 --max-concurrency 3 --dead-letter-queue myDLQ --retry-delay-secs=10"
					);

					expect(queueNameResolveRequest.count).toEqual(1);
					expect(postRequest.count).toEqual(1);

					expect(std.out).toMatchInlineSnapshot(`
						"Adding consumer to queue testQueue.
						Added consumer to queue testQueue."
					`);
				});

				it("should add a consumer with batchTimeout of 0", async () => {
					const queueNameResolveRequest = mockGetQueueByNameRequest(
						expectedQueueName,
						{
							queue_id: expectedQueueId,
							queue_name: expectedQueueName,
							created_on: "",
							producers: [],
							consumers: [],
							producers_total_count: 1,
							consumers_total_count: 0,
							modified_on: "",
						}
					);

					const expectedBody: PostTypedConsumerBody = {
						script_name: "testScript",
						type: "worker",
						environment_name: "myEnv",
						settings: {
							batch_size: 20,
							max_retries: 3,
							max_wait_time_ms: 0,
							max_concurrency: 3,
							retry_delay: 10,
						},
						dead_letter_queue: "myDLQ",
					};
					const postRequest = mockPostRequest(expectedQueueId, expectedBody);

					await runWrangler(
						"queues consumer add testQueue testScript --env myEnv --batch-size 20 --batch-timeout 0 --message-retries 3 --max-concurrency 3 --dead-letter-queue myDLQ --retry-delay-secs=10"
					);

					expect(queueNameResolveRequest.count).toEqual(1);
					expect(postRequest.count).toEqual(1);

					expect(std.out).toMatchInlineSnapshot(`
						"Adding consumer to queue testQueue.
						Added consumer to queue testQueue."
					`);
				});

				it("should show an error when two retry delays are set", async () => {
					const expectedBody: PostTypedConsumerBody = {
						script_name: "testScript",
						type: "worker",
						environment_name: "myEnv",
						settings: {
							batch_size: 20,
							max_retries: 3,
							max_wait_time_ms: 10 * 1000,
							max_concurrency: 3,
							retry_delay: 0,
						},
						dead_letter_queue: "myDLQ",
					};
					const requests = mockPostRequest("testQueue", expectedBody);

					await expect(
						runWrangler(
							"queues consumer add testQueue testScript --env myEnv --batch-size 20 --batch-timeout 10 --message-retries 3 --max-concurrency 3 --dead-letter-queue myDLQ --retry-delay-secs=5 --retry-delay-secs=10"
						)
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`[Error: Cannot specify --retry-delay-secs multiple times]`
					);

					expect(requests.count).toEqual(0);
				});

				it("should show an error when queue does not exist", async () => {
					const queueNameResolveRequest = mockGetQueueByNameRequest(
						expectedQueueName,
						null
					);
					const expectedBody: PostTypedConsumerBody = {
						script_name: "testScript",
						type: "worker",
						environment_name: "myEnv",
						settings: {
							batch_size: 20,
							max_retries: 3,
							max_wait_time_ms: 10 * 1000,
							max_concurrency: 3,
							retry_delay: 0,
						},
						dead_letter_queue: "myDLQ",
					};
					const postRequest = mockPostRequest(expectedQueueId, expectedBody);

					await expect(
						runWrangler(
							"queues consumer add testQueue testScript --env myEnv --batch-size 20 --batch-timeout 10 --message-retries 3 --max-concurrency 3 --dead-letter-queue myDLQ"
						)
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`[Error: Queue "testQueue" does not exist. To create it, run: wrangler queues create testQueue]`
					);

					expect(queueNameResolveRequest.count).toEqual(1);
					expect(postRequest.count).toEqual(0);
				});

				it.skip("should show link to dash when not enabled", async () => {
					const queueName = "testQueueId";
					msw.use(
						http.post(
							"*/accounts/:accountId/queues/:testQueueId/consumers",
							async ({ params }) => {
								expect(params.queueName).toEqual(queueName);
								expect(params.accountId).toEqual("some-account-id");
								return HttpResponse.json(
									{
										success: false,
										errors: [
											{
												code: 10023,
												message: "workers.api.error.unauthorized",
											},
										],
										messages: [],
										result: {},
									},
									{ status: 403 }
								);
							},
							{ once: true }
						)
					);

					await expect(
						runWrangler(`queues consumer add ${queueName} testScript`)
					).rejects.toThrowError();
					expect(std.out).toMatchInlineSnapshot(`
				"Adding consumer to queue testQueue.
				Queues is not currently enabled on this account. Go to https://dash.cloudflare.com/some-account-id/workers/queues to enable it.

				[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/some-account-id/queues/testQueue/consumers) failed.[0m

				  workers.api.error.unauthorized [code: 10023]

				  If you think this is a bug, please open an issue at:
				  [4mhttps://github.com/cloudflare/workers-sdk/issues/new/choose[0m

				"
			`);
				});
			});

			describe("delete", () => {
				function mockDeleteRequest(queueId: string, consumerId: string) {
					const requests = { count: 0 };
					const resource = `accounts/:accountId/queues/:expectedQueueId/consumers/:expectedConsumerId`;

					msw.use(
						http.delete(
							`*/${resource}`,
							async ({ params }) => {
								requests.count++;
								expect(params.accountId).toBe("some-account-id");
								expect(params.expectedQueueId).toBe(queueId);
								expect(params.expectedConsumerId).toBe(consumerId);
								return HttpResponse.json(
									{
										success: true,
										errors: [],
										messages: [],
										result: {},
									},
									{ status: 200 }
								);
							},
							{ once: true }
						)
					);

					return requests;
				}

				function mockServiceRequest(serviceName: string, defaultEnv: string) {
					const requests = { count: 0 };
					const resource = `accounts/:accountId/workers/services/:serviceName`;

					msw.use(
						http.get(
							`*/${resource}`,
							async ({ params }) => {
								requests.count++;
								expect(params.accountId).toBe("some-account-id");
								expect(params.serviceName).toBe(serviceName);
								return HttpResponse.json(
									{
										success: true,
										errors: [],
										messages: [],
										result: {
											id: serviceName,
											default_environment: {
												environment: defaultEnv,
											},
										},
									},
									{ status: 200 }
								);
							},
							{ once: true }
						)
					);
					return requests;
				}

				it("should show the correct help text", async () => {
					await runWrangler("queues consumer remove --help");
					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(`
						"wrangler queues consumer remove <queue-name> <script-name>

						Remove a Queue Worker Consumer

						POSITIONALS
						  queue-name   Name of the queue to configure  [string] [required]
						  script-name  Name of the consumer script  [string] [required]

						GLOBAL FLAGS
						  -c, --config   Path to Wrangler configuration file  [string]
						  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
						  -h, --help     Show help  [boolean]
						  -v, --version  Show version number  [boolean]"
					`);
				});

				it("should show an error when queue does not exist", async () => {
					const queueNameResolveRequest = mockGetQueueByNameRequest(
						expectedQueueName,
						null
					);
					const postRequest = mockDeleteRequest(
						expectedQueueId,
						expectedConsumerId
					);

					await expect(
						runWrangler(
							"queues consumer add testQueue testScript --env myEnv --batch-size 20 --batch-timeout 10 --message-retries 3 --max-concurrency 3 --dead-letter-queue myDLQ"
						)
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`[Error: Queue "testQueue" does not exist. To create it, run: wrangler queues create testQueue]`
					);

					expect(queueNameResolveRequest.count).toEqual(1);
					expect(postRequest.count).toEqual(0);
				});

				describe("when script consumers are in use", () => {
					it("should delete the correct consumer", async () => {
						const queueNameResolveRequest = mockGetQueueByNameRequest(
							expectedQueueName,
							{
								queue_id: expectedQueueId,
								queue_name: expectedQueueName,
								created_on: "",
								producers: [],
								consumers: [
									{
										consumer_id: expectedConsumerId,
										script: "testScript",
										type: "worker",
										settings: {},
									},
								],
								producers_total_count: 1,
								consumers_total_count: 0,
								modified_on: "",
							}
						);

						const deleteRequest = mockDeleteRequest(
							expectedQueueId,
							expectedConsumerId
						);
						await runWrangler("queues consumer remove testQueue testScript");

						expect(queueNameResolveRequest.count).toEqual(1);
						expect(deleteRequest.count).toEqual(1);
						expect(std.out).toMatchInlineSnapshot(`
						"Removing consumer from queue testQueue.
						Removed consumer from queue testQueue."
					`);
					});

					it("should show error when deleting a non-existing consumer", async () => {
						const queueNameResolveRequest = mockGetQueueByNameRequest(
							expectedQueueName,
							{
								queue_id: expectedQueueId,
								queue_name: expectedQueueName,
								created_on: "",
								producers: [],
								consumers: [
									{
										consumer_id: expectedConsumerId,
										script: "testScriptTwo",
										type: "worker",
										settings: {},
									},
								],
								producers_total_count: 1,
								consumers_total_count: 0,
								modified_on: "",
							}
						);

						const deleteRequest = mockDeleteRequest(
							expectedQueueId,
							expectedConsumerId
						);
						await expect(
							runWrangler("queues consumer remove testQueue testScript")
						).rejects.toThrowErrorMatchingInlineSnapshot(
							`[Error: No worker consumer 'testScript' exists for queue testQueue]`
						);

						expect(queueNameResolveRequest.count).toEqual(1);
						expect(deleteRequest.count).toEqual(0);
					});
				});

				describe("when service consumers are in use", () => {
					it("should delete a consumer with env set", async () => {
						const queueNameResolveRequest = mockGetQueueByNameRequest(
							expectedQueueName,
							{
								queue_id: expectedQueueId,
								queue_name: expectedQueueName,
								created_on: "",
								producers: [],
								consumers: [
									{
										consumer_id: expectedConsumerId,
										service: "testScript",
										environment: "myEnv",
										type: "worker",
										settings: {},
									},
								],
								producers_total_count: 1,
								consumers_total_count: 0,
								modified_on: "",
							}
						);

						const deleteRequest = mockDeleteRequest(
							expectedQueueId,
							expectedConsumerId
						);
						await runWrangler(
							"queues consumer remove testQueue testScript --env myEnv"
						);

						expect(queueNameResolveRequest.count).toEqual(1);
						expect(deleteRequest.count).toEqual(1);
						expect(std.out).toMatchInlineSnapshot(`
						"Removing consumer from queue testQueue.
						Removed consumer from queue testQueue."
					`);
					});

					it("should show error when deleting a non-matching environment", async () => {
						const queueNameResolveRequest = mockGetQueueByNameRequest(
							expectedQueueName,
							{
								queue_id: expectedQueueId,
								queue_name: expectedQueueName,
								created_on: "",
								producers: [],
								consumers: [
									{
										consumer_id: expectedConsumerId,
										service: "testScriptTwo",
										environment: "randomEnvironment",
										type: "worker",
										settings: {},
									},
								],
								producers_total_count: 1,
								consumers_total_count: 0,
								modified_on: "",
							}
						);

						const deleteRequest = mockDeleteRequest(
							expectedQueueId,
							expectedConsumerId
						);
						await expect(
							runWrangler(
								"queues consumer remove testQueue testScript --env anotherEnvironment"
							)
						).rejects.toThrowErrorMatchingInlineSnapshot(
							`[Error: No worker consumer 'testScript' exists for queue testQueue]`
						);

						expect(queueNameResolveRequest.count).toEqual(1);
						expect(deleteRequest.count).toEqual(0);
					});

					it("should delete a consumer without env set", async () => {
						const queueNameResolveRequest = mockGetQueueByNameRequest(
							expectedQueueName,
							{
								queue_id: expectedQueueId,
								queue_name: expectedQueueName,
								created_on: "",
								producers: [],
								consumers: [
									{
										consumer_id: expectedConsumerId,
										service: "testScript",
										environment: "myEnv",
										type: "worker",
										settings: {},
									},
								],
								producers_total_count: 1,
								consumers_total_count: 1,
								modified_on: "",
							}
						);

						const serviceRequest = mockServiceRequest("testScript", "myEnv");
						const deleteRequest = mockDeleteRequest(
							expectedQueueId,
							expectedConsumerId
						);

						await runWrangler("queues consumer remove testQueue testScript");

						expect(queueNameResolveRequest.count).toEqual(1);
						expect(deleteRequest.count).toEqual(1);
						expect(serviceRequest.count).toEqual(1);
						expect(std.out).toMatchInlineSnapshot(`
						"Removing consumer from queue testQueue.
						Removed consumer from queue testQueue."
						`);
					});

					describe("when multiple consumers are set", () => {
						it("should delete default environment consumer without env set", async () => {
							const expectedDefaultEnvironment = "staging";
							const expectedConsumerIdToDelete = "consumer-id-staging";
							const queueNameResolveRequest = mockGetQueueByNameRequest(
								expectedQueueName,
								{
									queue_id: expectedQueueId,
									queue_name: expectedQueueName,
									created_on: "",
									producers: [],
									consumers: [
										{
											consumer_id: expectedConsumerIdToDelete,
											service: "testScript",
											environment: "staging",
											type: "worker",
											settings: {},
										},
										{
											consumer_id: expectedConsumerId,
											service: "testScript",
											environment: "production",
											type: "worker",
											settings: {},
										},
									],
									producers_total_count: 1,
									consumers_total_count: 2,
									modified_on: "",
								}
							);

							const serviceRequest = mockServiceRequest(
								"testScript",
								expectedDefaultEnvironment
							);
							const deleteRequest = mockDeleteRequest(
								expectedQueueId,
								expectedConsumerIdToDelete
							);
							await runWrangler("queues consumer remove testQueue testScript");

							expect(queueNameResolveRequest.count).toEqual(1);
							expect(serviceRequest.count).toEqual(1);
							expect(deleteRequest.count).toEqual(1);
							expect(std.out).toMatchInlineSnapshot(`
							"Removing consumer from queue testQueue.
							Removed consumer from queue testQueue."
						`);
						});

						it("should delete matching consumer with env set", async () => {
							const expectedConsumerIdToDelete = "consumer-id-staging";
							const queueNameResolveRequest = mockGetQueueByNameRequest(
								expectedQueueName,
								{
									queue_id: expectedQueueId,
									queue_name: expectedQueueName,
									created_on: "",
									producers: [],
									consumers: [
										{
											consumer_id: expectedConsumerIdToDelete,
											service: "testScript",
											environment: "staging",
											type: "worker",
											settings: {},
										},
										{
											consumer_id: expectedConsumerId,
											service: "testScript",
											environment: "consumer-id-production",
											type: "worker",
											settings: {},
										},
									],
									producers_total_count: 1,
									consumers_total_count: 2,
									modified_on: "",
								}
							);

							const deleteRequest = mockDeleteRequest(
								expectedQueueId,
								expectedConsumerIdToDelete
							);
							await runWrangler(
								"queues consumer remove testQueue testScript --env staging"
							);

							expect(queueNameResolveRequest.count).toEqual(1);
							expect(deleteRequest.count).toEqual(1);
							expect(std.out).toMatchInlineSnapshot(`
								"Removing consumer from queue testQueue.
								Removed consumer from queue testQueue."
							`);
						});

						it("should show error when deleting on a non-matching environment", async () => {
							const expectedConsumerIdToDelete = "consumer-id-staging";
							const queueNameResolveRequest = mockGetQueueByNameRequest(
								expectedQueueName,
								{
									queue_id: expectedQueueId,
									queue_name: expectedQueueName,
									created_on: "",
									producers: [],
									consumers: [
										{
											consumer_id: expectedConsumerIdToDelete,
											service: "testScript",
											environment: "staging",
											type: "worker",
											settings: {},
										},
										{
											consumer_id: expectedConsumerId,
											service: "testScript",
											environment: "production",
											type: "worker",
											settings: {},
										},
									],
									producers_total_count: 1,
									consumers_total_count: 2,
									modified_on: "",
								}
							);

							const deleteRequest = mockDeleteRequest(
								expectedQueueId,
								expectedConsumerId
							);
							await expect(
								runWrangler(
									"queues consumer remove testQueue testScript --env anotherEnvironment"
								)
							).rejects.toThrowErrorMatchingInlineSnapshot(
								`[Error: No worker consumer 'testScript' exists for queue testQueue]`
							);

							expect(queueNameResolveRequest.count).toEqual(1);
							expect(deleteRequest.count).toEqual(0);
						});
					});
				});
			});
		});

		describe("http_pull consumers", () => {
			it("should show the correct help text", async () => {
				await runWrangler("queues consumer http --help");

				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.out).toMatchInlineSnapshot(`
					"wrangler queues consumer http

					Configure Queue HTTP Pull Consumers

					COMMANDS
					  wrangler queues consumer http add <queue-name>     Add a Queue HTTP Pull Consumer
					  wrangler queues consumer http remove <queue-name>  Remove a Queue HTTP Pull Consumer

					GLOBAL FLAGS
					  -c, --config   Path to Wrangler configuration file  [string]
					  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					  -h, --help     Show help  [boolean]
					  -v, --version  Show version number  [boolean]"
				`);
			});

			describe("add", () => {
				function mockPostRequest(
					queueId: string,
					expectedBody: PostTypedConsumerBody
				) {
					const requests = { count: 0 };
					msw.use(
						http.post(
							"*/accounts/:accountId/queues/:queueId/consumers",
							async ({ request, params }) => {
								requests.count += 1;
								expect(params.queueId).toEqual(queueId);
								expect(params.accountId).toEqual("some-account-id");
								expect(await request.json()).toEqual(expectedBody);
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

				it("should show the correct help text", async () => {
					await runWrangler("queues consumer http add --help");
					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(`
						"wrangler queues consumer http add <queue-name>

						Add a Queue HTTP Pull Consumer

						POSITIONALS
						  queue-name  Name of the queue for the consumer  [string] [required]

						GLOBAL FLAGS
						  -c, --config   Path to Wrangler configuration file  [string]
						  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
						  -h, --help     Show help  [boolean]
						  -v, --version  Show version number  [boolean]

						OPTIONS
						      --batch-size               Maximum number of messages per batch  [number]
						      --message-retries          Maximum number of retries for each message  [number]
						      --dead-letter-queue        Queue to send messages that failed to be consumed  [string]
						      --visibility-timeout-secs  The number of seconds a message will wait for an acknowledgement before being returned to the queue.  [number]
						      --retry-delay-secs         The number of seconds to wait before retrying a message  [number]"
					`);
				});

				it("should add a consumer using defaults", async () => {
					const queueNameResolveRequest = mockGetQueueByNameRequest(
						expectedQueueName,
						{
							queue_id: expectedQueueId,
							queue_name: expectedQueueName,
							created_on: "",
							producers: [],
							consumers: [],
							producers_total_count: 1,
							consumers_total_count: 0,
							modified_on: "",
						}
					);

					const expectedBody: PostTypedConsumerBody = {
						type: "http_pull",
						settings: {
							batch_size: undefined,
							max_retries: undefined,
							visibility_timeout_ms: undefined,
							retry_delay: undefined,
						},
						dead_letter_queue: undefined,
					};
					const postRequest = mockPostRequest(expectedQueueId, expectedBody);

					await runWrangler("queues consumer http add testQueue");
					expect(queueNameResolveRequest.count).toEqual(1);
					expect(postRequest.count).toEqual(1);
					expect(std.out).toMatchInlineSnapshot(`
							"Adding consumer to queue testQueue.
							Added consumer to queue testQueue."
					`);
				});

				it("should add a consumer using custom values", async () => {
					const queueNameResolveRequest = mockGetQueueByNameRequest(
						expectedQueueName,
						{
							queue_id: expectedQueueId,
							queue_name: expectedQueueName,
							created_on: "",
							producers: [],
							consumers: [],
							producers_total_count: 1,
							consumers_total_count: 0,
							modified_on: "",
						}
					);

					const expectedBody: PostTypedConsumerBody = {
						type: "http_pull",
						settings: {
							batch_size: 20,
							max_retries: 3,
							visibility_timeout_ms: 6000,
							retry_delay: 3,
						},
						dead_letter_queue: "myDLQ",
					};
					const postRequest = mockPostRequest(expectedQueueId, expectedBody);

					await runWrangler(
						"queues consumer http add testQueue --batch-size 20 --message-retries 3 --visibility-timeout-secs 6 --retry-delay-secs 3 --dead-letter-queue myDLQ"
					);
					expect(queueNameResolveRequest.count).toEqual(1);
					expect(postRequest.count).toEqual(1);
					expect(std.out).toMatchInlineSnapshot(`
						"Adding consumer to queue testQueue.
						Added consumer to queue testQueue."
					`);
				});
			});

			describe("delete", () => {
				function mockDeleteRequest(queueId: string, consumerId: string) {
					const requests = { count: 0 };
					const resource = `accounts/:accountId/queues/:expectedQueueId/consumers/:expectedConsumerId`;
					msw.use(
						http.delete(
							`*/${resource}`,
							async ({ params }) => {
								requests.count++;
								expect(params.accountId).toBe("some-account-id");
								expect(params.expectedQueueId).toBe(queueId);
								expect(params.expectedConsumerId).toBe(consumerId);
								return HttpResponse.json(
									{
										success: true,
										errors: [],
										messages: [],
										result: {},
									},
									{ status: 200 }
								);
							},
							{ once: true }
						)
					);

					return requests;
				}

				it("should show the correct help text", async () => {
					await runWrangler("queues consumer http remove --help");
					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(`
						"wrangler queues consumer http remove <queue-name>

						Remove a Queue HTTP Pull Consumer

						POSITIONALS
						  queue-name  Name of the queue for the consumer  [string] [required]

						GLOBAL FLAGS
						  -c, --config   Path to Wrangler configuration file  [string]
						  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
						  -h, --help     Show help  [boolean]
						  -v, --version  Show version number  [boolean]"
					`);
				});

				it("should delete a pull consumer", async () => {
					const queueNameResolveRequest = mockGetQueueByNameRequest(
						expectedQueueName,
						{
							queue_id: expectedQueueId,
							queue_name: expectedQueueName,
							created_on: "",
							producers: [],
							consumers: [
								{
									type: "http_pull",
									consumer_id: expectedConsumerId,
									settings: {},
								},
							],
							producers_total_count: 1,
							consumers_total_count: 1,
							modified_on: "",
						}
					);

					const postRequest = mockDeleteRequest(
						expectedQueueId,
						expectedConsumerId
					);
					await runWrangler("queues consumer http remove testQueue");

					expect(postRequest.count).toEqual(1);
					expect(queueNameResolveRequest.count).toEqual(1);
					expect(std.out).toMatchInlineSnapshot(`
							"Removing consumer from queue testQueue.
							Removed consumer from queue testQueue."
						`);
				});
			});
		});

		describe("info", () => {
			const mockQueue = {
				queue_id: "1234567",
				queue_name: expectedQueueName,
				created_on: "2024-05-20T14:43:56.70498Z",
				producers: [
					{
						namespace: "testnamespace",
						script: "test-producer1",
						type: "worker",
					},
					{
						namespace: "testnamespace",
						script: "test-producer2",
						type: "worker",
					},
				],
				consumers: [
					{
						dead_letter_queue: "testdlq",
						settings: { batch_size: 10 },
						consumer_id: "111",
						type: "worker",
						script: "test-consumer",
					},
				],
				producers_total_count: 2,
				consumers_total_count: 1,
				modified_on: "2024-07-19T14:43:56.70498Z",
			};

			it("should return the documentation for the info command when using the --help param", async () => {
				await runWrangler("queues info --help");
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.out).toMatchInlineSnapshot(`
					"wrangler queues info <name>

					Get Queue information

					POSITIONALS
					  name  The name of the queue  [string] [required]

					GLOBAL FLAGS
					  -c, --config   Path to Wrangler configuration file  [string]
					  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					  -h, --help     Show help  [boolean]
					  -v, --version  Show version number  [boolean]"
				`);
			});
			it("should return queue info with worker producers when the queue has workers configured as producers", async () => {
				mockGetQueueByNameRequest(expectedQueueName, mockQueue);
				await runWrangler("queues info testQueue");
				expect(std.out).toMatchInlineSnapshot(`
					"Queue Name: testQueue
					Queue ID: 1234567
					Created On: 2024-05-20T14:43:56.70498Z
					Last Modified: 2024-07-19T14:43:56.70498Z
					Number of Producers: 2
					Producers: worker:test-producer1, worker:test-producer2
					Number of Consumers: 1
					Consumers: worker:test-consumer"
				`);
			});
			it('should return "http consumer" and a curl command when the consumer type is http_pull', async () => {
				const mockHTTPPullQueue = {
					...mockQueue,
					consumers: [{ ...mockQueue.consumers[0], type: "http_pull" }],
				};
				mockGetQueueByNameRequest(expectedQueueName, mockHTTPPullQueue);
				await runWrangler("queues info testQueue");
				expect(std.out).toMatchInlineSnapshot(`
					"Queue Name: testQueue
					Queue ID: 1234567
					Created On: 2024-05-20T14:43:56.70498Z
					Last Modified: 2024-07-19T14:43:56.70498Z
					Number of Producers: 2
					Producers: worker:test-producer1, worker:test-producer2
					Number of Consumers: 1
					Consumers: HTTP Pull Consumer.
					Pull messages using:
					curl \\"https://api.cloudflare.com/client/v4/accounts/some-account-id/queues/1234567/messages/pull\\" /
						--header \\"Authorization: Bearer <add your api key here>\\" /
						--header \\"Content-Type: application/json\\" /
						--data '{ \\"visibility_timeout\\": 10000, \\"batch_size\\": 2 }'"
				`);
			});
			it("should return the list of r2 bucket producers when the queue is used in an r2 event notification", async () => {
				const mockEventNotificationQueue = {
					...mockQueue,
					producers: [
						{ type: "r2_bucket", bucket_name: "test-bucket1" },
						{ type: "r2_bucket", bucket_name: "test-bucket2" },
					],
					consumers: [
						{
							...mockQueue.consumers[0],
							type: "r2_bucket",
							bucket_name: "bucket-consumer",
						},
					],
				};
				mockGetQueueByNameRequest(
					expectedQueueName,
					mockEventNotificationQueue
				);
				await runWrangler("queues info testQueue");
				expect(std.out).toMatchInlineSnapshot(`
					"Queue Name: testQueue
					Queue ID: 1234567
					Created On: 2024-05-20T14:43:56.70498Z
					Last Modified: 2024-07-19T14:43:56.70498Z
					Number of Producers: 2
					Producers: r2_bucket:test-bucket1, r2_bucket:test-bucket2
					Number of Consumers: 1
					Consumers: r2_bucket:bucket-consumer"
				`);
			});
		});
	});
});
