import assert from "node:assert";
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
import type { RawConfig } from "../src/config";
import type { WranglerLongLivedCommand } from "./helpers/wrangler";

type TestCase<T = void> = {
	name: string;
	scriptPath: string;
	setup?: (helper: WranglerE2ETestHelper) => Promise<T> | T;
	generateWranglerConfig: (setupResult: T) => RawConfig;
	expectedResponseMatch: string | RegExp;
	// Flag for resources that can work without mixed mode (just AI)
	worksWithoutMixedMode?: boolean;
};

const testCases: TestCase<Record<string, string>>[] = [
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
			const { stdout } = await helper.run(
				`wrangler deploy target-worker.js --name ${targetWorkerName} --compatibility-date 2025-01-01`
			);
			const match = stdout.match(
				/(?<url>https:\/\/tmp-e2e-.+?\..+?\.workers\.dev)/
			);
			assert(match?.groups);
			const deployedUrl = match.groups.url;

			await vi.waitFor(
				async () => {
					const resp = await fetch(deployedUrl);
					await expect(await resp.text()).toBe("Hello from target worker");
				},
				{ interval: 1_000, timeout: 40_000 }
			);

			onTestFinished(async () => {
				await helper.run(`wrangler delete --name ${targetWorkerName}`);
			});
			return { worker: targetWorkerName };
		},
		generateWranglerConfig: ({ worker: targetWorkerName }) => ({
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
			return { id: ns };
		},
		generateWranglerConfig: ({ id: namespaceId }) => ({
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
			return { name };
		},
		generateWranglerConfig: ({ name: bucketName }) => ({
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
	describe.each(testCases)("$name", (testCase) => {
		let helper: WranglerE2ETestHelper;

		beforeEach(() => {
			helper = new WranglerE2ETestHelper();
		});

		it("works with mixed mode enabled", async () => {
			await helper.seed(
				path.resolve(__dirname, "./seed-files/mixed-mode-workers")
			);

			await writeWranglerConfig(testCase, helper);

			const worker = helper.runLongLived("wrangler dev --x-mixed-mode");

			const { url } = await worker.waitForReady();

			const response = await fetchText(url);
			expect(response).toMatch(testCase.expectedResponseMatch);
		});

		it.skipIf(testCase.worksWithoutMixedMode)(
			"fails when mixed mode is disabled",
			async () => {
				await helper.seed(
					path.resolve(__dirname, "./seed-files/mixed-mode-workers")
				);

				await writeWranglerConfig(testCase, helper);

				const worker = helper.runLongLived("wrangler dev");

				const { url } = await worker.waitForReady();

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
			await helper.seed(
				path.resolve(__dirname, "./seed-files/mixed-mode-workers")
			);

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

			worker = helper.runLongLived("wrangler dev --x-mixed-mode", {
				stopOnTestFinished: false,
			});

			const ready = await worker.waitForReady();
			url = ready.url;
		});
		afterAll(async () => {
			await worker.stop();
		});

		it.each(testCases)("$name with worker reload", async (testCase) => {
			await writeWranglerConfig(testCase, helper);

			await worker.waitForReload();

			await vi.waitFor(
				async () => {
					const response = await fetchText(url);
					expect(response).toMatch(testCase.expectedResponseMatch);
				},
				{ interval: 1_000, timeout: 40_000 }
			);
		});
	});
});

async function writeWranglerConfig(
	testCase: TestCase<Record<string, string>>,
	helper: WranglerE2ETestHelper
) {
	const setupResult = (await testCase.setup?.(helper)) ?? {};

	const wranglerConfig = testCase.generateWranglerConfig(setupResult);
	await helper.seed({
		"wrangler.json": JSON.stringify(wranglerConfig, null, 2),
	});
}
