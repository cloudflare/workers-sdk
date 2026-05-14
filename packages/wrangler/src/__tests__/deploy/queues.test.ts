import * as fs from "node:fs";
import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { getInstalledPackageVersion } from "../../autoconfig/frameworks/utils/packages";
import { clearOutputFilePath } from "../../output";
import { fetchSecrets } from "../../utils/fetch-secrets";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockUploadWorkerRequest } from "../helpers/mock-upload-worker";
import { mockGetSettings } from "../helpers/mock-worker-settings";
import { mockSubDomainRequest } from "../helpers/mock-workers-subdomain";
import { createFetchResult, msw } from "../helpers/msw";
import { mswListNewDeploymentsLatestFull } from "../helpers/msw/handlers/versions";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import {
	mockDeploymentsListRequest,
	mockGetQueueByName,
	mockLastDeploymentRequest,
	mockPatchScriptSettings,
	mockSetScriptConsumers,
} from "./helpers";
import type { QueueResponse } from "../../queues/client";

vi.mock("command-exists");
vi.mock("../../check/commands", async (importOriginal) => {
	return {
		...(await importOriginal()),
		analyseBundle() {
			return `{}`;
		},
	};
});

vi.mock("../../utils/fetch-secrets");

vi.mock("../../package-manager", async (importOriginal) => ({
	...(await importOriginal()),
	sniffUserAgent: () => "npm",
	getPackageManager() {
		return {
			type: "npm",
			npx: "npx",
		};
	},
}));

vi.mock("../../autoconfig/run");
vi.mock("../../autoconfig/frameworks/utils/packages");
vi.mock("@cloudflare/cli-shared-helpers/command");

describe("deploy", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();

	beforeEach(() => {
		vi.stubGlobal("setTimeout", (fn: () => void) => {
			setImmediate(fn);
		});
		setIsTTY(true);
		mockLastDeploymentRequest();
		mockDeploymentsListRequest();
		mockPatchScriptSettings();
		mockGetSettings();
		msw.use(...mswListNewDeploymentsLatestFull);
		// Pretend all R2 buckets exist for the purposes of deployment testing.
		// Otherwise, wrangler deploy would try to provision them. The provisioning
		// behaviour is tested in provision.test.ts
		msw.use(
			http.get("*/accounts/:accountId/r2/buckets/:bucketName", async () => {
				return HttpResponse.json(createFetchResult({}));
			})
		);
		vi.mocked(fetchSecrets).mockResolvedValue([]);
		vi.mocked(getInstalledPackageVersion).mockReturnValue(undefined);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		clearDialogs();
		clearOutputFilePath();
	});

	describe("queues", () => {
		const queueId = "queue-id";
		const queueName = "queue1";
		it("should upload producer bindings", async ({ expect }) => {
			writeWranglerConfig({
				queues: {
					producers: [{ binding: "QUEUE_ONE", queue: "queue1" }],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						type: "queue",
						name: "QUEUE_ONE",
						queue_name: queueName,
					},
				],
			});
			const existingQueue = {
				queue_id: queueId,
				queue_name: queueName,
				created_on: "",
				producers: [],
				consumers: [],
				producers_total_count: 1,
				consumers_total_count: 0,
				modified_on: "",
			};
			mockGetQueueByName(queueName, existingQueue);

			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                     Resource
				env.QUEUE_ONE (queue1)      Queue

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				  Producer for queue1
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should update queue producers on deploy", async ({ expect }) => {
			writeWranglerConfig({
				queues: {
					producers: [
						{
							queue: queueName,
							binding: "MY_QUEUE",
							delivery_delay: 10,
						},
					],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			const existingQueue = {
				queue_id: queueId,
				queue_name: queueName,
				created_on: "",
				producers: [],
				consumers: [],
				producers_total_count: 1,
				consumers_total_count: 0,
				modified_on: "",
			};
			mockGetQueueByName(queueName, existingQueue);

			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                    Resource
				env.MY_QUEUE (queue1)      Queue

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				  Producer for queue1
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should set worker queue consumers on deploy", async ({ expect }) => {
			writeWranglerConfig({
				queues: {
					consumers: [
						{
							queue: queueName,
							dead_letter_queue: "myDLQ",
							max_batch_size: 5,
							max_batch_timeout: 3,
							max_retries: 10,
							retry_delay: 5,
						},
					],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			const existingQueue: QueueResponse = {
				queue_id: queueId,
				queue_name: queueName,
				created_on: "",
				producers: [],
				consumers: [],
				producers_total_count: 0,
				consumers_total_count: 0,
				modified_on: "",
			};
			mockGetQueueByName(queueName, existingQueue);
			mockSetScriptConsumers(
				"test-name",
				{
					consumers: [
						{
							queue_id: queueId,
							type: "worker",
							script_name: "test-name",
							dead_letter_queue: "myDLQ",
							settings: {
								batch_size: 5,
								max_retries: 10,
								max_wait_time_ms: 3000,
								retry_delay: 5,
							},
						},
					],
				},
				{
					created: [{ queue_id: queueId, queue_name: queueName }],
					updated: [],
					deleted: [],
					failed: [],
				}
			);
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				  Consumer for queue1
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should set worker queue consumers on deploy, using command line script name arg", async ({
			expect,
		}) => {
			const expectedScriptName = "command-line-arg-script-name";
			writeWranglerConfig({
				queues: {
					consumers: [
						{
							queue: queueName,
							dead_letter_queue: "myDLQ",
							max_batch_size: 5,
							max_batch_timeout: 3,
							max_retries: 10,
							retry_delay: 5,
						},
					],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest({ expectedScriptName });
			const existingQueue: QueueResponse = {
				queue_id: queueId,
				queue_name: queueName,
				created_on: "",
				producers: [],
				consumers: [],
				producers_total_count: 0,
				consumers_total_count: 0,
				modified_on: "",
			};
			mockGetQueueByName(queueName, existingQueue);
			mockSetScriptConsumers(
				expectedScriptName,
				{
					consumers: [
						{
							queue_id: queueId,
							type: "worker",
							script_name: expectedScriptName,
							dead_letter_queue: "myDLQ",
							settings: {
								batch_size: 5,
								max_retries: 10,
								max_wait_time_ms: 3000,
								retry_delay: 5,
							},
						},
					],
				},
				{
					created: [{ queue_id: queueId, queue_name: queueName }],
					updated: [],
					deleted: [],
					failed: [],
				}
			);
			await runWrangler(`deploy index.js --name ${expectedScriptName}`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded command-line-arg-script-name (TIMINGS)
				Deployed command-line-arg-script-name triggers (TIMINGS)
				  https://command-line-arg-script-name.test-sub-domain.workers.dev
				  Consumer for queue1
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should send all configured consumers in a single request", async ({
			expect,
		}) => {
			const secondQueueName = "queue2";
			const secondQueueId = "queue2-id";
			writeWranglerConfig({
				queues: {
					consumers: [
						{
							queue: queueName,
							max_batch_size: 5,
						},
						{
							queue: secondQueueName,
							max_batch_size: 10,
							max_retries: 2,
						},
					],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			// `ensureQueuesExistByConfig` batches the lookup, so the mock returns
			// both queues from one call.
			msw.use(
				http.get("*/accounts/:accountId/queues?*", async ({ request }) => {
					const url = new URL(request.url);
					const names = url.searchParams.getAll("name");
					expect(names).toEqual([queueName, secondQueueName]);
					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: [
							{
								queue_id: queueId,
								queue_name: queueName,
								created_on: "",
								producers: [],
								consumers: [],
								producers_total_count: 0,
								consumers_total_count: 0,
								modified_on: "",
							},
							{
								queue_id: secondQueueId,
								queue_name: secondQueueName,
								created_on: "",
								producers: [],
								consumers: [],
								producers_total_count: 0,
								consumers_total_count: 0,
								modified_on: "",
							},
						],
					});
				})
			);
			mockSetScriptConsumers(
				"test-name",
				{
					consumers: [
						{
							queue_id: queueId,
							type: "worker",
							script_name: "test-name",
							settings: { batch_size: 5 },
						},
						{
							queue_id: secondQueueId,
							type: "worker",
							script_name: "test-name",
							settings: { batch_size: 10, max_retries: 2 },
						},
					],
				},
				{
					created: [
						{ queue_id: queueId, queue_name: queueName },
						{ queue_id: secondQueueId, queue_name: secondQueueName },
					],
					updated: [],
					deleted: [],
					failed: [],
				}
			);
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				  Consumer for queue1
				  Consumer for queue2
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should reject http_pull consumer type in config", async ({
			expect,
		}) => {
			writeWranglerConfig({
				queues: {
					consumers: [
						{
							queue: queueName,
							// Cast needed to simulate invalid user input that bypasses static type checking; runtime validation is what this test exercises
							type: "http_pull" as "worker",
						},
					],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			await expect(runWrangler("deploy index.js")).rejects.toThrowError(
				/Only "worker" consumers can be configured in your Wrangler configuration/
			);
		});

		it("should support queue consumer concurrency with a max concurrency specified", async ({
			expect,
		}) => {
			writeWranglerConfig({
				queues: {
					consumers: [
						{
							queue: queueName,
							dead_letter_queue: "myDLQ",
							max_batch_size: 5,
							max_batch_timeout: 3,
							max_retries: 10,
							max_concurrency: 5,
						},
					],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			const existingQueue: QueueResponse = {
				queue_id: queueId,
				queue_name: queueName,
				created_on: "",
				producers: [],
				consumers: [],
				producers_total_count: 0,
				consumers_total_count: 0,
				modified_on: "",
			};
			mockGetQueueByName(queueName, existingQueue);
			mockSetScriptConsumers(
				"test-name",
				{
					consumers: [
						{
							queue_id: queueId,
							type: "worker",
							script_name: "test-name",
							dead_letter_queue: "myDLQ",
							settings: {
								batch_size: 5,
								max_retries: 10,
								max_wait_time_ms: 3000,
								max_concurrency: 5,
							},
						},
					],
				},
				{
					created: [{ queue_id: queueId, queue_name: queueName }],
					updated: [],
					deleted: [],
					failed: [],
				}
			);
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				  Consumer for queue1
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should support queue consumer concurrency with a null max concurrency", async ({
			expect,
		}) => {
			writeWranglerConfig({
				queues: {
					consumers: [
						{
							queue: queueName,
							dead_letter_queue: "myDLQ",
							max_batch_size: 5,
							max_batch_timeout: 3,
							max_retries: 10,
							max_concurrency: null,
						},
					],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest();

			const existingQueue: QueueResponse = {
				queue_id: queueId,
				queue_name: queueName,
				created_on: "",
				producers: [],
				consumers: [],
				producers_total_count: 0,
				consumers_total_count: 0,
				modified_on: "",
			};
			mockGetQueueByName(queueName, existingQueue);
			mockSetScriptConsumers(
				"test-name",
				{
					consumers: [
						{
							queue_id: queueId,
							type: "worker",
							script_name: "test-name",
							dead_letter_queue: "myDLQ",
							settings: {
								batch_size: 5,
								max_retries: 10,
								max_wait_time_ms: 3000,
							},
						},
					],
				},
				{
					created: [{ queue_id: queueId, queue_name: queueName }],
					updated: [],
					deleted: [],
					failed: [],
				}
			);

			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				  Consumer for queue1
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should support queue consumer with max_batch_timeout of 0", async ({
			expect,
		}) => {
			writeWranglerConfig({
				queues: {
					consumers: [
						{
							queue: queueName,
							dead_letter_queue: "myDLQ",
							max_batch_size: 5,
							max_batch_timeout: 0,
							max_retries: 10,
							max_concurrency: null,
						},
					],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest();

			const existingQueue: QueueResponse = {
				queue_id: queueId,
				queue_name: queueName,
				created_on: "",
				producers: [],
				consumers: [],
				producers_total_count: 0,
				consumers_total_count: 0,
				modified_on: "",
			};
			mockGetQueueByName(queueName, existingQueue);
			mockSetScriptConsumers(
				"test-name",
				{
					consumers: [
						{
							queue_id: queueId,
							type: "worker",
							script_name: "test-name",
							dead_letter_queue: "myDLQ",
							settings: {
								batch_size: 5,
								max_retries: 10,
								max_wait_time_ms: 0,
							},
						},
					],
				},
				{
					created: [{ queue_id: queueId, queue_name: queueName }],
					updated: [],
					deleted: [],
					failed: [],
				}
			);

			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				  Consumer for queue1
				Current Version ID: Galaxy-Class"
			`);
		});

		it("consumer should error when a queue doesn't exist", async ({
			expect,
		}) => {
			writeWranglerConfig({
				queues: {
					producers: [],
					consumers: [
						{
							queue: queueName,
							dead_letter_queue: "myDLQ",
							max_batch_size: 5,
							max_batch_timeout: 3,
							max_retries: 10,
						},
					],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			mockGetQueueByName(queueName, null);

			await expect(
				runWrangler("deploy index.js")
			).rejects.toMatchInlineSnapshot(
				`[Error: Queue "queue1" does not exist. To create it, run: wrangler queues create queue1]`
			);
		});

		it("producer should error when a queue doesn't exist", async ({
			expect,
		}) => {
			writeWranglerConfig({
				queues: {
					producers: [{ queue: queueName, binding: "QUEUE_ONE" }],
					consumers: [],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			mockGetQueueByName(queueName, null);

			await expect(
				runWrangler("deploy index.js")
			).rejects.toMatchInlineSnapshot(
				`[Error: Queue "queue1" does not exist. To create it, run: wrangler queues create queue1]`
			);
		});

		// Wrangler always calls the consumers endpoint so stale registrations
		// from previous deploys get cleaned up — including the case where the
		// user removes all consumers from their config.
		it("should call the consumers endpoint with an empty list when no consumers are configured", async ({
			expect,
		}) => {
			writeWranglerConfig({
				queues: {
					producers: [],
					consumers: [],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			const requests = mockSetScriptConsumers("test-name", {
				consumers: [],
			});

			await runWrangler("deploy index.js");

			expect(requests.count).toBe(1);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should report cleanup of stale consumers when no consumers are configured", async ({
			expect,
		}) => {
			writeWranglerConfig({
				queues: {
					producers: [],
					consumers: [],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			mockSetScriptConsumers(
				"test-name",
				{ consumers: [] },
				{
					created: [],
					updated: [],
					deleted: [{ queue_id: "stale-id", queue_name: "stale-queue" }],
					failed: [],
				}
			);

			await runWrangler("deploy index.js");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				  Removed consumer for stale-queue
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should not block the deploy when the consumer sync request fails", async ({
			expect,
		}) => {
			writeWranglerConfig({
				queues: {
					producers: [],
					consumers: [],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			msw.use(
				http.put(
					"*/accounts/:accountId/workers/scripts/:scriptName/queue-consumers",
					async () => {
						return HttpResponse.json(
							{
								success: false,
								errors: [{ code: 10000, message: "server unavailable" }],
								messages: [],
								result: null,
							},
							{ status: 500 }
						);
					},
					{ once: true }
				)
			);

			await runWrangler("deploy index.js");

			expect(process.exitCode).toBe(1);
			expect(std.err).toContain("Failed to configure queue consumers");

			// Reset so it doesn't affect other tests
			process.exitCode = 0;
		});

		it("should report a mix of created, updated, deleted, and failed consumers", async ({
			expect,
		}) => {
			writeWranglerConfig({
				queues: {
					consumers: [
						{
							queue: queueName,
							max_batch_size: 5,
						},
					],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			const existingQueue: QueueResponse = {
				queue_id: queueId,
				queue_name: queueName,
				created_on: "",
				producers: [],
				consumers: [],
				producers_total_count: 0,
				consumers_total_count: 0,
				modified_on: "",
			};
			mockGetQueueByName(queueName, existingQueue);
			mockSetScriptConsumers(
				"test-name",
				{
					consumers: [
						{
							queue_id: queueId,
							type: "worker",
							script_name: "test-name",
							settings: {
								batch_size: 5,
							},
						},
					],
				},
				{
					created: [{ queue_id: "id-a", queue_name: "order-queue" }],
					updated: [{ queue_id: "id-b", queue_name: "notification-queue" }],
					deleted: [{ queue_id: "id-c", queue_name: "old-queue" }],
					failed: [
						{
							queue_id: "id-d",
							queue_name: "broken-queue",
							error: "broker unavailable",
						},
					],
				}
			);

			await runWrangler("deploy index.js");

			expect(process.exitCode).toBe(1);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				  Consumer for order-queue
				  Consumer for notification-queue
				  Removed consumer for old-queue
				  X Failed to configure consumer for broken-queue: broker unavailable
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toContain(
				"Failed to configure consumer for broken-queue: broker unavailable"
			);

			// Reset so it doesn't affect other tests
			process.exitCode = 0;
		});
	});
});
