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

	it("should not duplicate queue warnings during multiple config resolutions", async () => {
		writeWranglerConfig({
			name: "test-worker",
			main: "index.js",
			queues: {
				producers: [{ queue: "test-queue", binding: "QUEUE" }],
			},
		});

		writeFileSync(
			"index.js",
			"export default { fetch() { return new Response('Hello'); } };"
		);

		const controller = new ConfigController();
		const input = {
			entrypoint: "index.js",
			dev: { remote: true },
		};

		// Call controller.set() multiple times to simulate config changes during dev server lifecycle (important-comment)
		// This tests that warnings only appear once despite multiple config resolutions (important-comment)
		await controller.set(input);
		await controller.set(input);
		await controller.set(input);

		const warningCount = (
			std.warn.match(
				/Queues are not yet supported in wrangler dev remote mode/g
			) || []
		).length;
		expect(warningCount).toBe(1);

		await controller.teardown();
	});

	it("should not duplicate analytics engine warnings during multiple config resolutions", async () => {
		writeWranglerConfig({
			name: "test-worker",
			main: "index.js",
			analytics_engine_datasets: [{ binding: "AE", dataset: "test-dataset" }],
		});

		// Use service worker format to trigger the Analytics Engine warning
		// The warning only appears when format === "service-worker" AND local mode AND analytics_engine bindings exist
		writeFileSync(
			"index.js",
			"addEventListener('fetch', event => { event.respondWith(new Response('Hello')); });"
		);

		const controller = new ConfigController();
		const input = {
			entrypoint: "index.js",
			dev: { remote: false },
		};

		// Call controller.set() multiple times to simulate config changes during dev server lifecycle
		// This tests that warnings only appear once despite multiple config resolutions
		await controller.set(input);
		await controller.set(input);
		await controller.set(input);

		const warningCount = (
			std.warn.match(
				/Analytics Engine is not supported locally when using the service-worker format/g
			) || []
		).length;
		expect(warningCount).toBe(1);

		await controller.teardown();
	});

	it("should not duplicate service binding warnings during multiple config resolutions", async () => {
		writeWranglerConfig({
			name: "test-worker",
			main: "index.js",
			services: [{ binding: "SERVICE", service: "test-service" }],
		});

		writeFileSync(
			"index.js",
			"export default { fetch() { return new Response('Hello'); } };"
		);

		const controller = new ConfigController();
		const input = {
			entrypoint: "index.js",
			dev: { remote: true },
		};

		// Call controller.set() multiple times to simulate config changes during dev server lifecycle
		// This tests that warnings only appear once despite multiple config resolutions
		await controller.set(input);
		await controller.set(input);
		await controller.set(input);

		const warningCount = (
			std.warn.match(/This worker is bound to live services/g) || []
		).length;
		expect(warningCount).toBe(1);

		await controller.teardown();
	});

	it("should not duplicate container warnings during multiple config resolutions", async () => {
		writeWranglerConfig({
			name: "test-worker",
			main: "index.js",
			durable_objects: {
				bindings: [{ name: "TEST_DO", class_name: "TestContainer" }],
			},
			containers: [
				{
					name: "test-container",
					image: "docker.io/httpd:latest",
					class_name: "TestContainer",
				},
			],
		});

		writeFileSync(
			"index.js",
			"export default { fetch() { return new Response('Hello'); } };"
		);

		const controller = new ConfigController();
		const input = {
			entrypoint: "index.js",
			dev: { remote: true, enableContainers: true },
		};

		// Call controller.set() multiple times to simulate config changes during dev server lifecycle
		// This tests that warnings only appear once despite multiple config resolutions
		await controller.set(input);
		await controller.set(input);
		await controller.set(input);

		const warningCount = (
			std.warn.match(/Containers are only supported in local mode/g) || []
		).length;
		expect(warningCount).toBe(1);

		await controller.teardown();
	});

	it("should not duplicate upstream protocol warnings during multiple config resolutions", async () => {
		writeWranglerConfig({
			name: "test-worker",
			main: "index.js",
		});

		writeFileSync(
			"index.js",
			"export default { fetch() { return new Response('Hello'); } };"
		);

		const controller = new ConfigController();
		const input = {
			entrypoint: "index.js",
			dev: { remote: true, origin: { secure: false } },
		};

		// Call controller.set() multiple times to simulate config changes during dev server lifecycle
		// This tests that warnings only appear once despite multiple config resolutions
		await controller.set(input);
		await controller.set(input);
		await controller.set(input);

		const warningCount = (
			std.warn.match(
				/Setting upstream-protocol to http is not currently supported for remote mode/g
			) || []
		).length;
		expect(warningCount).toBe(1);

		await controller.teardown();
	});
});
