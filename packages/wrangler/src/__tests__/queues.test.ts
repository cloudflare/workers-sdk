import { type QueueResponse, type PostConsumerBody } from "../queues/client";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import {
	createFetchResult,
	setMockRawResponse,
	setMockResponse,
	unsetAllMocks,
} from "./helpers/mock-cfetch";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

describe("wrangler", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const std = mockConsoleMethods();

	afterEach(() => {
		unsetAllMocks();
	});

	describe("queues", () => {
		it("should show the correct help text", async () => {
			await runWrangler("queues --help");
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
			"wrangler queues

			🇶 Configure Workers Queues

			Commands:
			  wrangler queues list           List Queues
			  wrangler queues create <name>  Create a Queue
			  wrangler queues delete <name>  Delete a Queue
			  wrangler queues consumer       Configure Queue Consumers

			Flags:
			  -c, --config   Path to .toml configuration file  [string]
			  -e, --env      Environment to use for operations and .env files  [string]
			  -h, --help     Show help  [boolean]
			  -v, --version  Show version number  [boolean]"
		`);
		});

		describe("list", () => {
			function mockListRequest(queues: QueueResponse[], page: number) {
				const requests = { count: 0 };
				setMockResponse(
					"/accounts/:accountId/workers/queues",
					([_url, accountId], init, params) => {
						requests.count++;
						expect(params.get("page")).toEqual((page || 1).toString());
						expect(accountId).toEqual("some-account-id");
						expect(init).toEqual({});
						return queues;
					}
				);
				return requests;
			}

			it("should show the correct help text", async () => {
				await runWrangler("queues list --help");
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.out).toMatchInlineSnapshot(`
			"wrangler queues list

			List Queues

			Flags:
			  -c, --config   Path to .toml configuration file  [string]
			  -e, --env      Environment to use for operations and .env files  [string]
			  -h, --help     Show help  [boolean]
			  -v, --version  Show version number  [boolean]

			Options:
			      --page  Page number for pagination  [number]"
		`);
			});

			it("should list queues on page 1 with no --page", async () => {
				const expectedQueues: QueueResponse[] = [
					{
						queue_name: "queue-1",
						created_on: "01-01-2001",
						modified_on: "01-01-2001",
					},
					{
						queue_name: "queue-2",
						created_on: "01-01-2001",
						modified_on: "01-01-2001",
					},
				];
				const expectedPage = 1;
				mockListRequest(expectedQueues, expectedPage);
				await runWrangler("queues list");

				expect(std.err).toMatchInlineSnapshot(`""`);
				const buckets = JSON.parse(std.out);
				expect(buckets).toEqual(expectedQueues);
			});

			it("should list queues using --page=2", async () => {
				const expectedQueues: QueueResponse[] = [
					{
						queue_name: "queue-100",
						created_on: "01-01-2001",
						modified_on: "01-01-2001",
					},
				];
				const expectedPage = 2;
				mockListRequest(expectedQueues, expectedPage);
				await runWrangler("queues list --page=2");

				expect(std.err).toMatchInlineSnapshot(`""`);
				const buckets = JSON.parse(std.out);
				expect(buckets).toEqual(expectedQueues);
			});
		});

		describe("create", () => {
			function mockCreateRequest(expectedQueueName: string) {
				const requests = { count: 0 };
				setMockResponse(
					"/accounts/:accountId/workers/queues",
					"POST",
					([_url, accountId], { body }) => {
						expect(accountId).toEqual("some-account-id");
						const queueName = JSON.parse(body as string).queue_name;
						expect(queueName).toEqual(expectedQueueName);
						requests.count += 1;
					}
				);
				return requests;
			}

			it("should show the correct help text", async () => {
				await runWrangler("queues create --help");
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.out).toMatchInlineSnapshot(`
			"wrangler queues create <name>

			Create a Queue

			Positionals:
			  name  The name of the queue  [string] [required]

			Flags:
			  -c, --config   Path to .toml configuration file  [string]
			  -e, --env      Environment to use for operations and .env files  [string]
			  -h, --help     Show help  [boolean]
			  -v, --version  Show version number  [boolean]"
		`);
			});

			it("should create a queue", async () => {
				const requests = mockCreateRequest("testQueue");
				await runWrangler("queues create testQueue");
				expect(std.out).toMatchInlineSnapshot(`
					"Creating queue testQueue.
					Created queue testQueue."
			  `);
				expect(requests.count).toEqual(1);
			});

			it("should show link to dash when not enabled", async () => {
				const queueName = "testQueue";
				setMockRawResponse(
					"/accounts/:accountId/workers/queues",
					([_url, accountId]) => {
						expect(accountId).toEqual("some-account-id");
						return createFetchResult(null, false, [
							{ message: "workers.api.error.unauthorized", code: 10023 },
						]);
					}
				);
				await expect(
					runWrangler(`queues create ${queueName}`)
				).rejects.toThrowError();
				expect(std.out).toMatchInlineSnapshot(`
			"Creating queue testQueue.
			Queues is not currently enabled on this account. Go to https://dash.cloudflare.com/some-account-id/workers/queues to enable it.

			[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/some-account-id/workers/queues) failed.[0m

			  workers.api.error.unauthorized [code: 10023]

			  If you think this is a bug, please open an issue at:
			  [4mhttps://github.com/cloudflare/wrangler2/issues/new/choose[0m

			"
		`);
			});
		});

		describe("delete", () => {
			function mockDeleteRequest(expectedQueueName: string) {
				const requests = { count: 0 };
				setMockResponse(
					`/accounts/:accountId/workers/queues/${expectedQueueName}`,
					"DELETE",
					([_url, accountId]) => {
						expect(accountId).toEqual("some-account-id");
						requests.count += 1;
					}
				);
				return requests;
			}

			it("should show the correct help text", async () => {
				await runWrangler("queues delete --help");
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.out).toMatchInlineSnapshot(`
			"wrangler queues delete <name>

			Delete a Queue

			Positionals:
			  name  The name of the queue  [string] [required]

			Flags:
			  -c, --config   Path to .toml configuration file  [string]
			  -e, --env      Environment to use for operations and .env files  [string]
			  -h, --help     Show help  [boolean]
			  -v, --version  Show version number  [boolean]"
		`);
			});

			it("should delete a queue", async () => {
				const requests = mockDeleteRequest("testQueue");
				await runWrangler("queues delete testQueue");
				expect(std.out).toMatchInlineSnapshot(`
					"Deleting queue testQueue.
					Deleted queue testQueue."
			  `);
				expect(requests.count).toEqual(1);
			});
		});

		describe("consumers", () => {
			it("should show the correct help text", async () => {
				await runWrangler("queues consumer --help");

				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.out).toMatchInlineSnapshot(`
			"wrangler queues consumer

			Configure Queue Consumers

			Commands:
			  wrangler queues consumer add <queue-name> <script-name>     Add a Queue Consumer
			  wrangler queues consumer remove <queue-name> <script-name>  Remove a Queue Consumer

			Flags:
			  -c, --config   Path to .toml configuration file  [string]
			  -e, --env      Environment to use for operations and .env files  [string]
			  -h, --help     Show help  [boolean]
			  -v, --version  Show version number  [boolean]"
		`);
			});

			describe("add", () => {
				function mockPostRequest(
					expectedQueueName: string,
					expectedBody: PostConsumerBody
				) {
					const requests = { count: 0 };
					setMockResponse(
						`/accounts/:accountId/workers/queues/${expectedQueueName}/consumers`,
						"POST",
						([_url, accountId], { body }) => {
							expect(accountId).toEqual("some-account-id");
							expect(JSON.parse(body as string)).toEqual(expectedBody);
							requests.count += 1;
						}
					);
					return requests;
				}

				it("should show the correct help text", async () => {
					await runWrangler("queues consumer add --help");
					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(`
				"wrangler queues consumer add <queue-name> <script-name>

				Add a Queue Consumer

				Positionals:
				  queue-name   Name of the queue to configure  [string] [required]
				  script-name  Name of the consumer script  [string] [required]

				Flags:
				  -c, --config   Path to .toml configuration file  [string]
				  -e, --env      Environment to use for operations and .env files  [string]
				  -h, --help     Show help  [boolean]
				  -v, --version  Show version number  [boolean]

				Options:
				      --batch-size         Maximum number of messages per batch  [number]
				      --batch-timeout      Maximum number of seconds to wait to fill a batch with messages  [number]
				      --message-retries    Maximum number of retries for each message  [number]
				      --dead-letter-queue  Queue to send messages that failed to be consumed  [string]"
			`);
				});

				it("should add a consumer using defaults", async () => {
					const expectedBody: PostConsumerBody = {
						script_name: "testScript",
						environment_name: "",
						settings: {
							batch_size: undefined,
							max_retries: undefined,
							max_wait_time_ms: undefined,
						},
						dead_letter_queue: undefined,
					};
					mockPostRequest("testQueue", expectedBody);
					await runWrangler("queues consumer add testQueue testScript");
					expect(std.out).toMatchInlineSnapshot(`
							"Adding consumer to queue testQueue.
							Added consumer to queue testQueue."
					`);
				});

				it("should add a consumer using custom values", async () => {
					const expectedBody: PostConsumerBody = {
						script_name: "testScript",
						environment_name: "myEnv",
						settings: {
							batch_size: 20,
							max_retries: 3,
							max_wait_time_ms: 10 * 1000,
						},
						dead_letter_queue: "myDLQ",
					};
					mockPostRequest("testQueue", expectedBody);

					await runWrangler(
						"queues consumer add testQueue testScript --env myEnv --batch-size 20 --batch-timeout 10 --message-retries 3 --dead-letter-queue myDLQ"
					);
					expect(std.out).toMatchInlineSnapshot(`
						"Adding consumer to queue testQueue.
						Added consumer to queue testQueue."
					`);
				});

				it("should show link to dash when not enabled", async () => {
					const queueName = "testQueue";
					setMockRawResponse(
						`/accounts/:accountId/workers/queues/${queueName}/consumers`,
						([_url, accountId]) => {
							expect(accountId).toEqual("some-account-id");
							return createFetchResult(null, false, [
								{ message: "workers.api.error.unauthorized", code: 10023 },
							]);
						}
					);
					await expect(
						runWrangler(`queues consumer add ${queueName} testScript`)
					).rejects.toThrowError();
					expect(std.out).toMatchInlineSnapshot(`
				"Adding consumer to queue testQueue.
				Queues is not currently enabled on this account. Go to https://dash.cloudflare.com/some-account-id/workers/queues to enable it.

				[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/some-account-id/workers/queues/testQueue/consumers) failed.[0m

				  workers.api.error.unauthorized [code: 10023]

				  If you think this is a bug, please open an issue at:
				  [4mhttps://github.com/cloudflare/wrangler2/issues/new/choose[0m

				"
			`);
				});
			});

			describe("delete", () => {
				function mockDeleteRequest(
					expectedQueueName: string,
					expectedScriptName: string,
					expectedEnvName?: string
				) {
					let resource = `/accounts/:accountId/workers/queues/${expectedQueueName}/consumers/${expectedScriptName}`;
					if (expectedEnvName !== undefined) {
						resource += `/environments/${expectedEnvName}`;
					}
					setMockResponse(resource, "DELETE", ([_url, accountId]) => {
						expect(accountId).toEqual("some-account-id");
					});
				}

				it("should show the correct help text", async () => {
					await runWrangler("queues consumer remove --help");
					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(`
				"wrangler queues consumer remove <queue-name> <script-name>

				Remove a Queue Consumer

				Positionals:
				  queue-name   Name of the queue to configure  [string] [required]
				  script-name  Name of the consumer script  [string] [required]

				Flags:
				  -c, --config   Path to .toml configuration file  [string]
				  -e, --env      Environment to use for operations and .env files  [string]
				  -h, --help     Show help  [boolean]
				  -v, --version  Show version number  [boolean]"
			`);
				});

				it("should delete a consumer with no --env", async () => {
					mockDeleteRequest("testQueue", "testScript");
					await runWrangler("queues consumer remove testQueue testScript");
					expect(std.out).toMatchInlineSnapshot(`
						"Removing consumer from queue testQueue.
						Removed consumer from queue testQueue."
					`);
				});

				it("should delete a consumer with --env", async () => {
					mockDeleteRequest("testQueue", "testScript", "myEnv");
					await runWrangler(
						"queues consumer remove testQueue testScript --env myEnv"
					);
					expect(std.out).toMatchInlineSnapshot(`
						"Removing consumer from queue testQueue.
						Removed consumer from queue testQueue."
					`);
				});
			});
		});
	});
});
