import { type QueueResponse } from "../queues/client";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { setMockResponse, unsetAllMocks } from "./helpers/mock-cfetch";
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

				🆀 Configure Workers Queues

				Commands:
				  wrangler queues list           List Queues
				  wrangler queues create <name>  Create a Queue
				  wrangler queues delete <name>  Delete a Queue

				Flags:
				  -c, --config   Path to .toml configuration file  [string]
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
	});
});
