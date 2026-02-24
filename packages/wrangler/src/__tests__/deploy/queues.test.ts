/* eslint-disable workers-sdk/no-vitest-import-expect */

import * as fs from "node:fs";
import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
	mockGetServiceByName,
	mockLastDeploymentRequest,
	mockPatchScriptSettings,
	mockPostConsumerById,
	mockPostQueueHTTPConsumer,
	mockPutQueueConsumerById,
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
vi.mock("../../autoconfig/c3-vendor/command");

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
		it("should upload producer bindings", async () => {
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

		it("should update queue producers on deploy", async () => {
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

		it("should post worker queue consumers on deploy", async () => {
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
			mockPostConsumerById(queueId, {
				dead_letter_queue: "myDLQ",
				type: "worker",
				script_name: "test-name",
				settings: {
					batch_size: 5,
					max_retries: 10,
					max_wait_time_ms: 3000,
					retry_delay: 5,
				},
			});
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

		it("should post worker queue consumers on deploy, using command line script name arg", async () => {
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
			mockPostConsumerById(queueId, {
				dead_letter_queue: "myDLQ",
				type: "worker",
				script_name: expectedScriptName,
				settings: {
					batch_size: 5,
					max_retries: 10,
					max_wait_time_ms: 3000,
					retry_delay: 5,
				},
			});
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

		it("should update worker queue consumers on deploy", async () => {
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
			const expectedConsumerId = "consumerId";
			const existingQueue: QueueResponse = {
				queue_id: queueId,
				queue_name: queueName,
				created_on: "",
				producers: [],
				consumers: [
					{
						script: "test-name",
						consumer_id: expectedConsumerId,
						type: "worker",
						settings: {},
					},
				],
				producers_total_count: 1,
				consumers_total_count: 1,
				modified_on: "",
			};
			mockGetQueueByName(queueName, existingQueue);
			mockPutQueueConsumerById(queueId, queueName, expectedConsumerId, {
				dead_letter_queue: "myDLQ",
				type: "worker",
				script_name: "test-name",
				settings: {
					batch_size: 5,
					max_retries: 10,
					max_wait_time_ms: 3000,
					retry_delay: 5,
				},
			});
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

		it("should update worker (service) queue consumers with default environment on deploy", async () => {
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
			const expectedConsumerId = "consumerId";
			const expectedConsumerName = "test-name";
			const expectedEnvironment = "production";
			const existingQueue: QueueResponse = {
				queue_id: queueId,
				queue_name: queueName,
				created_on: "",
				producers: [],
				consumers: [
					{
						service: expectedConsumerName,
						environment: "production",
						consumer_id: expectedConsumerId,
						type: "worker",
						settings: {},
					},
				],
				producers_total_count: 1,
				consumers_total_count: 1,
				modified_on: "",
			};
			mockGetQueueByName(queueName, existingQueue);
			mockGetServiceByName(expectedConsumerName, expectedEnvironment);
			mockPutQueueConsumerById(queueId, queueName, expectedConsumerId, {
				dead_letter_queue: "myDLQ",
				type: "worker",
				script_name: "test-name",
				settings: {
					batch_size: 5,
					max_retries: 10,
					max_wait_time_ms: 3000,
					retry_delay: 5,
				},
			});

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

		it("should post queue http consumers on deploy", async () => {
			writeWranglerConfig({
				queues: {
					consumers: [
						{
							queue: queueName,
							type: "http_pull",
							dead_letter_queue: "myDLQ",
							max_batch_size: 5,
							visibility_timeout_ms: 4000,
							max_retries: 10,
							retry_delay: 1,
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
			mockPostQueueHTTPConsumer(queueId, {
				type: "http_pull",
				dead_letter_queue: "myDLQ",
				settings: {
					batch_size: 5,
					max_retries: 10,
					visibility_timeout_ms: 4000,
					retry_delay: 1,
				},
			});
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

		it("should update queue http consumers when one already exists for queue", async () => {
			writeWranglerConfig({
				queues: {
					consumers: [
						{
							queue: queueName,
							type: "http_pull",
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
				consumers: [
					{
						type: "http_pull",
						consumer_id: "queue1-consumer-id",
						settings: {},
					},
				],
				producers_total_count: 0,
				consumers_total_count: 0,
				modified_on: "",
			};
			mockGetQueueByName(queueName, existingQueue);

			msw.use(
				http.put(
					`*/accounts/:accountId/queues/:queueId/consumers/:consumerId`,
					async ({ params }) => {
						expect(params.queueId).toEqual(queueId);
						expect(params.consumerId).toEqual("queue1-consumer-id");
						expect(params.accountId).toEqual("some-account-id");
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: null,
						});
					}
				)
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

		it("should support queue consumer concurrency with a max concurrency specified", async () => {
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
			const consumerId = "consumer-id";
			const existingQueue: QueueResponse = {
				queue_id: queueId,
				queue_name: queueName,
				created_on: "",
				producers: [],
				consumers: [
					{
						type: "worker",
						script: "test-name",
						consumer_id: consumerId,
						settings: {},
					},
				],
				producers_total_count: 0,
				consumers_total_count: 0,
				modified_on: "",
			};
			mockGetQueueByName(queueName, existingQueue);
			mockPutQueueConsumerById(queueId, queueName, consumerId, {
				dead_letter_queue: "myDLQ",
				type: "worker",
				script_name: "test-name",
				settings: {
					batch_size: 5,
					max_retries: 10,
					max_wait_time_ms: 3000,
					max_concurrency: 5,
				},
			});
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

		it("should support queue consumer concurrency with a null max concurrency", async () => {
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

			const consumerId = "consumer-id";
			const existingQueue: QueueResponse = {
				queue_id: queueId,
				queue_name: queueName,
				created_on: "",
				producers: [],
				consumers: [
					{
						type: "worker",
						script: "test-name",
						consumer_id: consumerId,
						settings: {},
					},
				],
				producers_total_count: 0,
				consumers_total_count: 0,
				modified_on: "",
			};
			mockGetQueueByName(queueName, existingQueue);
			mockPutQueueConsumerById(queueId, queueName, consumerId, {
				dead_letter_queue: "myDLQ",
				type: "worker",
				script_name: "test-name",
				settings: {
					batch_size: 5,
					max_retries: 10,
					max_wait_time_ms: 3000,
				},
			});

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

		it("should support queue consumer with max_batch_timeout of 0", async () => {
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

			const consumerId = "consumer-id";
			const existingQueue: QueueResponse = {
				queue_id: queueId,
				queue_name: queueName,
				created_on: "",
				producers: [],
				consumers: [
					{
						type: "worker",
						script: "test-name",
						consumer_id: consumerId,
						settings: {},
					},
				],
				producers_total_count: 0,
				consumers_total_count: 0,
				modified_on: "",
			};
			mockGetQueueByName(queueName, existingQueue);
			mockPutQueueConsumerById(queueId, queueName, consumerId, {
				dead_letter_queue: "myDLQ",
				type: "worker",
				script_name: "test-name",
				settings: {
					batch_size: 5,
					max_retries: 10,
					max_wait_time_ms: 0,
				},
			});

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

		it("consumer should error when a queue doesn't exist", async () => {
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

		it("producer should error when a queue doesn't exist", async () => {
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
	});
});
