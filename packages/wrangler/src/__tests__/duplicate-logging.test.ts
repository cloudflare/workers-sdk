import { writeFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { ConfigController } from "../api/startDevWorker/ConfigController";
import { logger } from "../logger";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { writeWranglerConfig } from "./helpers/write-wrangler-config";
import type { StartDevWorkerInput, Unstable_RawConfig } from "../api";

describe("duplicate logging prevention", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	mockAccountId();
	mockApiToken();

	beforeEach(() => {
		logger.clearHistory();
	});

	async function testConfigOnceWarning({
		wranglerConfig,
		indexJsContent,
		startDevWorkerInput,
		expectedWarningRegex,
	}: {
		wranglerConfig: Unstable_RawConfig;
		indexJsContent: string;
		startDevWorkerInput: StartDevWorkerInput;
		expectedWarningRegex: RegExp;
	}) {
		writeWranglerConfig({ ...wranglerConfig, main: "index.js" });
		writeFileSync("index.js", indexJsContent);

		const controller = new ConfigController();

		const input = {
			...startDevWorkerInput,
			entrypoint: "index.js",
		};
		// Call controller.set() multiple times to simulate config changes during dev server lifecycle (important-comment)
		// This tests that warnings only appear once despite multiple config resolutions (important-comment)
		await controller.set(input);
		await controller.set(input);

		const warningCount = (std.warn.match(expectedWarningRegex) || []).length;
		expect(warningCount).toBe(1);

		await controller.teardown();
	}

	it("should not duplicate queue warnings during multiple config resolutions", async () => {
		await testConfigOnceWarning({
			wranglerConfig: {
				queues: {
					producers: [{ queue: "test-queue", binding: "QUEUE" }],
				},
			},
			indexJsContent:
				"export default { fetch() { return new Response('Hello'); } };",
			startDevWorkerInput: {
				dev: { remote: true },
			},
			expectedWarningRegex:
				/Queues are not yet supported in wrangler dev remote mode/g,
		});
	});

	it("should not duplicate analytics engine warnings during multiple config resolutions", async () => {
		await testConfigOnceWarning({
			wranglerConfig: {
				analytics_engine_datasets: [{ binding: "AE", dataset: "test-dataset" }],
			},
			indexJsContent:
				// Use service worker format to trigger the Analytics Engine warning
				// The warning only appears when format === "service-worker" AND local mode AND analytics_engine bindings exist
				"addEventListener('fetch', event => { event.respondWith(new Response('Hello')); });",
			startDevWorkerInput: {
				dev: { remote: false },
			},
			expectedWarningRegex:
				/Analytics Engine is not supported locally when using the service-worker format/g,
		});
	});

	it("should not duplicate service binding warnings during multiple config resolutions", async () => {
		await testConfigOnceWarning({
			wranglerConfig: {
				services: [{ binding: "SERVICE", service: "test-service" }],
			},
			indexJsContent:
				"export default { fetch() { return new Response('Hello'); } };",
			startDevWorkerInput: {
				dev: { remote: true },
			},
			expectedWarningRegex: /This worker is bound to live services/g,
		});
	});

	it("should not duplicate upstream protocol warnings during multiple config resolutions", async () => {
		await testConfigOnceWarning({
			wranglerConfig: {},
			indexJsContent:
				"export default { fetch() { return new Response('Hello'); } };",
			startDevWorkerInput: {
				dev: { remote: true, origin: { secure: false } },
			},
			expectedWarningRegex:
				/Setting upstream-protocol to http is not currently supported for remote mode/g,
		});
	});
});
