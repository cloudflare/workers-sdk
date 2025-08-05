import { writeFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { ConfigController } from "../api/startDevWorker/ConfigController";
import { logger } from "../logger";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { writeWranglerConfig } from "./helpers/write-wrangler-config";

describe("duplicate logging prevention", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	mockAccountId();
	mockApiToken();

	beforeEach(() => {
		logger.clearHistory();
	});

	async function testConfigOnceWarning(
		wranglerConfig: object,
		indexContent: string,
		input: object,
		expectedWarningRegex: RegExp
	) {
		writeWranglerConfig(wranglerConfig);
		writeFileSync("index.js", indexContent);

		const controller = new ConfigController();

		await controller.set(input);
		await controller.set(input);
		await controller.set(input);

		const warningCount = (std.warn.match(expectedWarningRegex) || []).length;
		expect(warningCount).toBe(1);

		await controller.teardown();
	}

	it("should not duplicate queue warnings during multiple config resolutions", async () => {
		await testConfigOnceWarning(
			{
				name: "test-worker",
				main: "index.js",
				queues: {
					producers: [{ queue: "test-queue", binding: "QUEUE" }],
				},
			},
			"export default { fetch() { return new Response('Hello'); } };",
			{
				entrypoint: "index.js",
				dev: { remote: true },
			},
			/Queues are not yet supported in wrangler dev remote mode/g
		);
	});

	it("should not duplicate analytics engine warnings during multiple config resolutions", async () => {
		await testConfigOnceWarning(
			{
				name: "test-worker",
				main: "index.js",
				analytics_engine_datasets: [{ binding: "AE", dataset: "test-dataset" }],
			},
			"addEventListener('fetch', event => { event.respondWith(new Response('Hello')); });",
			{
				entrypoint: "index.js",
				dev: { remote: false },
			},
			/Analytics Engine is not supported locally when using the service-worker format/g
		);
	});

	it("should not duplicate service binding warnings during multiple config resolutions", async () => {
		await testConfigOnceWarning(
			{
				name: "test-worker",
				main: "index.js",
				services: [{ binding: "SERVICE", service: "test-service" }],
			},
			"export default { fetch() { return new Response('Hello'); } };",
			{
				entrypoint: "index.js",
				dev: { remote: true },
			},
			/This worker is bound to live services/g
		);
	});

	it("should not duplicate upstream protocol warnings during multiple config resolutions", async () => {
		await testConfigOnceWarning(
			{
				name: "test-worker",
				main: "index.js",
			},
			"export default { fetch() { return new Response('Hello'); } };",
			{
				entrypoint: "index.js",
				dev: { remote: true, origin: { secure: false } },
			},
			/Setting upstream-protocol to http is not currently supported for remote mode/g
		);
	});
});
