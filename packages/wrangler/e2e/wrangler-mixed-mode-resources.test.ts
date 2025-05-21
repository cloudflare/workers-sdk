import path from "node:path";
import dedent from "ts-dedent";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	onTestFinished,
	vi,
} from "vitest";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { fetchText } from "./helpers/fetch-text";
import { generateResourceName } from "./helpers/generate-resource-name";
import { WranglerLongLivedCommand } from "./helpers/wrangler";
import type { RawConfig } from "../src/config";

/**
 * Type for defining test cases for mixed mode resources in Wrangler
 */
type TestCase<T = void> = {
	name: string;
	scriptPath: string;
	setup?: (helper: WranglerE2ETestHelper) => Promise<T> | T;
	generateWranglerConfig: (setupResult: T) => RawConfig;
	expectedResponseMatch: string | RegExp;
	// Special flag for resources that can work without mixed mode
	worksWithoutMixedMode?: boolean;
};

/**
 * Set of test cases for different binding types in mixed mode
 */
const testCases: TestCase<any>[] = [
	{
		name: "Service Binding",
		scriptPath: "service-binding.js",
		setup: async (helper) => {
			const targetWorkerName = generateResourceName();
			await helper.seed({
				"target-worker.js": dedent/* javascript */ `
          import { WorkerEntrypoint } from "cloudflare:workers"
          export default {
            fetch(request) {
              return new Response("Hello from target worker")
            }
          }
          export class CustomEntrypoint extends WorkerEntrypoint {
            fetch(request) {
              return new Response("Hello from target worker entrypoint")
            }
          }
        `,
			});
			await helper.run(
				`wrangler deploy target-worker.js --name ${targetWorkerName} --compatibility-date 2025-01-01`
			);
			onTestFinished(async () => {
				await helper.run(`wrangler delete --name ${targetWorkerName}`);
			});
			return targetWorkerName;
		},
		generateWranglerConfig: (targetWorkerName) => ({
			name: "mixed-mode-service-binding-test",
			main: "service-binding.js",
			compatibility_date: "2025-01-01",
			services: [
				{
					binding: "SERVICE",
					service: targetWorkerName,
					remote: true,
				},
				{
					binding: "SERVICE_WITH_ENTRYPOINT",
					service: targetWorkerName,
					entrypoint: "CustomEntrypoint",
					remote: true,
				},
			],
		}),
		expectedResponseMatch: JSON.stringify({
			default: "Hello from target worker",
			entrypoint: "Hello from target worker entrypoint",
		}),
	},
	{
		name: "AI",
		scriptPath: "ai.js",
		generateWranglerConfig: () => ({
			name: "mixed-mode-ai-test",
			main: "ai.js",
			compatibility_date: "2025-01-01",
			ai: {
				binding: "AI",
				remote: true,
			},
		}),
		expectedResponseMatch: "This is a response from Workers AI",
		// AI bindings work without mixed mode flag
		worksWithoutMixedMode: true,
	},
	{
		name: "KV",
		scriptPath: "kv.js",
		setup: async (helper) => {
			const ns = await helper.kv(false);
			await helper.run(
				`wrangler kv key put --remote --namespace-id=${ns} test-mixed-mode-key existing-value`
			);
			return ns;
		},
		generateWranglerConfig: (namespaceId) => ({
			name: "mixed-mode-kv-test",
			main: "kv.js",
			compatibility_date: "2025-01-01",
			kv_namespaces: [
				{
					binding: "KV_BINDING",
					id: namespaceId,
					remote: true,
				},
			],
		}),
		expectedResponseMatch: "The pre-existing value is: existing-value",
	},
	{
		name: "R2",
		scriptPath: "r2.js",
		setup: async (helper) => {
			await helper.seed({ "test.txt": "existing-value" });
			const name = await helper.r2(false);
			await helper.run(
				`wrangler r2 object put --remote ${name}/test-mixed-mode-key --file test.txt`
			);
			onTestFinished(async () => {
				await helper.run(
					`wrangler r2 object delete --remote ${name}/test-mixed-mode-key`
				);
			});
			return name;
		},
		generateWranglerConfig: (bucketName) => ({
			name: "mixed-mode-r2-test",
			main: "r2.js",
			compatibility_date: "2025-01-01",
			r2_buckets: [
				{
					binding: "R2_BINDING",
					bucket_name: bucketName,
					remote: true,
				},
			],
		}),
		expectedResponseMatch: "The pre-existing value is: existing-value",
	},
	{
		name: "D1",
		scriptPath: "d1.js",
		setup: async (helper) => {
			await helper.seed({
				"schema.sql": dedent`
          CREATE TABLE entries (key TEXT PRIMARY KEY, value TEXT);
          INSERT INTO entries (key, value) VALUES ('test-mixed-mode-key', 'existing-value');
        `,
			});
			const { id, name } = await helper.d1(false);
			await helper.run(
				`wrangler d1 execute --remote ${name} --file schema.sql`
			);
			return { id, name };
		},
		generateWranglerConfig: ({ id, name }) => ({
			name: "mixed-mode-d1-test",
			main: "d1.js",
			compatibility_date: "2025-01-01",
			d1_databases: [
				{
					binding: "DB",
					database_id: id,
					database_name: name,
					remote: true,
				},
			],
		}),
		expectedResponseMatch: "existing-value",
	},
];

describe("Wrangler Mixed Mode E2E Tests", () => {
	describe.skip.each(testCases)("$name", (testCase) => {
		let helper: WranglerE2ETestHelper;

		beforeEach(() => {
			helper = new WranglerE2ETestHelper();
		});

		it("works with mixed mode enabled", async () => {
			// Copy the test workers into the temp directory
			await helper.seed(
				path.resolve(__dirname, "./seed-files/mixed-mode-workers")
			);

			// Set up any resources needed for the test
			const setupResult = await testCase.setup?.(helper);

			// Create the wrangler.json file
			const wranglerConfig = testCase.generateWranglerConfig(setupResult);
			await helper.seed({
				"wrangler.json": JSON.stringify(wranglerConfig, null, 2),
			});

			// Start the worker with mixed mode enabled
			const worker = helper.runLongLived("wrangler dev --x-mixed-mode");

			// Wait for the worker to be ready
			const { url } = await worker.waitForReady();

			// Test that the response contains the expected content
			const response = await fetchText(url);
			expect(response).toMatch(testCase.expectedResponseMatch);
		});

		it.skipIf(testCase.worksWithoutMixedMode)(
			"fails when mixed mode is disabled",
			async () => {
				// Copy the test workers into the temp directory
				await helper.seed(
					path.resolve(__dirname, "./seed-files/mixed-mode-workers")
				);

				// Set up any resources needed for the test
				const setupResult = await testCase.setup?.(helper);

				// Create the wrangler.json file with remote:true (to ensure it would need mixed mode)
				const wranglerConfig = testCase.generateWranglerConfig(setupResult);
				await helper.seed({
					"wrangler.json": JSON.stringify(wranglerConfig, null, 2),
				});

				// Start the worker WITHOUT mixed mode flag
				const worker = helper.runLongLived("wrangler dev");

				// Wait for the worker to be ready
				const { url } = await worker.waitForReady();

				// Try fetching and validating the response - this should NOT match the expected output
				// because mixed mode is required for remote:true bindings but not enabled
				const response = await fetchText(url);
				expect(response).not.toMatch(testCase.expectedResponseMatch);
			}
		);
	});

	describe.sequential("Sequential mixed mode tests with worker reloads", () => {
		let worker: WranglerLongLivedCommand;
		let helper: WranglerE2ETestHelper;

		let url: string;

		beforeAll(async () => {
			helper = new WranglerE2ETestHelper();
			// Copy all the test workers into the temp directory
			await helper.seed(
				path.resolve(__dirname, "./seed-files/mixed-mode-workers")
			);

			// Start with a placeholder wrangler config
			await helper.seed({
				"wrangler.json": JSON.stringify(
					{
						name: "mixed-mode-sequential-test",
						main: "placeholder.js",
						compatibility_date: "2025-01-01",
					},
					null,
					2
				),
				"placeholder.js":
					"export default { fetch() { return new Response('Ready to start tests') } }",
			});

			// Start the worker with mixed mode enabled
			worker = helper.runLongLived("wrangler dev --x-mixed-mode", {
				cleanup: false,
			});

			// Wait for the worker to be ready
			const ready = await worker.waitForReady();
			url = ready.url;
		});
		afterAll(async () => {
			await worker.stop();
		});

		it.each(testCases)("$name", async (testCase) => {
			// Run each test case sequentially
			console.log(`Testing ${testCase.name} with worker reload...`);

			// Get the setup result if it exists
			const setupResult = await testCase.setup?.(helper);

			// Update the wrangler config for this test case
			const wranglerConfig = testCase.generateWranglerConfig(setupResult);
			await helper.seed({
				"wrangler.json": JSON.stringify(wranglerConfig, null, 2),
			});

			// Wait for the worker to reload
			await worker.waitForReload();

			await vi.waitFor(async () => {
				const response = await fetchText(url);
				expect(response).toMatch(testCase.expectedResponseMatch);
			});
			// Test that the response contains the expected content
		});
	});
});
