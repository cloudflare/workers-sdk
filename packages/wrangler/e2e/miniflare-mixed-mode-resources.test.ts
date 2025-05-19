import path from "node:path";
import dedent from "ts-dedent";
import { beforeEach, describe, expect, it, onTestFinished } from "vitest";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";
import type { Binding } from "../src/api";
import type { MixedModeConnectionString, WorkerOptions } from "miniflare";
import type { ExpectStatic } from "vitest";

type TestCase<T = void> = {
	name: string;
	scriptPath: string;
	mixedModeSessionConfig:
		| Record<string, Binding>
		| ((setup: T) => Record<string, Binding>);
	miniflareConfig: (
		connection: MixedModeConnectionString,
		setup: T
	) => Partial<WorkerOptions>;
	setup?: (helper: WranglerE2ETestHelper) => Promise<T> | T;
	match: ExpectStatic;
};
const testCases: TestCase<string>[] = [
	{
		name: "AI",
		scriptPath: "ai.js",
		mixedModeSessionConfig: {
			AI: {
				type: "ai",
			},
		},
		miniflareConfig: (connection) => ({
			ai: {
				binding: "AI",
				mixedModeConnectionString: connection,
			},
		}),
		match: expect.stringMatching(/This is a response from Workers AI/),
	},
	{
		name: "Browser",
		scriptPath: "browser.js",
		mixedModeSessionConfig: {
			BROWSER: {
				type: "browser",
			},
		},
		miniflareConfig: (connection) => ({
			browserRendering: {
				binding: "BROWSER",
				mixedModeConnectionString: connection,
			},
		}),
		match: expect.stringMatching(/sessionId/),
	},
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
		mixedModeSessionConfig: (target) => ({
			SERVICE: {
				type: "service",
				service: target,
			},
			SERVICE_WITH_ENTRYPOINT: {
				type: "service",
				entrypoint: "CustomEntrypoint",
				service: target,
			},
		}),
		miniflareConfig: (connection, target) => ({
			serviceBindings: {
				SERVICE: {
					name: target,
					mixedModeConnectionString: connection,
				},
				SERVICE_WITH_ENTRYPOINT: {
					name: target,
					entrypoint: "CustomEntrypoint",
					mixedModeConnectionString: connection,
				},
			},
		}),
		match: expect.stringMatching(
			JSON.stringify({
				default: "Hello from target worker",
				entrypoint: "Hello from target worker entrypoint",
			})
		),
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
		mixedModeSessionConfig: (ns) => ({
			KV_BINDING: {
				type: "kv_namespace",
				id: ns,
			},
		}),
		miniflareConfig: (connection, ns) => ({
			kvNamespaces: {
				KV_BINDING: {
					id: ns,
					mixedModeConnectionString: connection,
				},
			},
		}),
		match: expect.stringMatching("The pre-existing value is: existing-value"),
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
		mixedModeSessionConfig: (name) => ({
			R2_BINDING: {
				type: "r2_bucket",
				bucket_name: name,
			},
		}),
		miniflareConfig: (connection, name) => ({
			r2Buckets: {
				R2_BINDING: {
					id: name,
					mixedModeConnectionString: connection,
				},
			},
		}),
		match: expect.stringMatching("The pre-existing value is: existing-value"),
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
			return id;
		},
		mixedModeSessionConfig: (id) => ({
			DB: {
				type: "d1",
				database_id: id,
			},
		}),
		miniflareConfig: (connection, id) => ({
			d1Databases: {
				DB: {
					id: id,
					mixedModeConnectionString: connection,
				},
			},
		}),
		match: expect.stringMatching("existing-value"),
	},
	{
		name: "Vectorize",
		scriptPath: "vectorize.js",
		setup: async (helper) => {
			const name = await helper.vectorize(
				32,
				"euclidean",
				"well-known-vectorize"
			);
			return name;
		},
		mixedModeSessionConfig: (name) => ({
			VECTORIZE_BINDING: {
				type: "vectorize",
				index_name: name,
			},
		}),
		miniflareConfig: (connection, name) => ({
			vectorize: {
				VECTORIZE_BINDING: {
					index_name: name,
					mixedModeConnectionString: connection,
				},
			},
		}),
		match: expect.stringContaining(
			`[{"id":"a44706aa-a366-48bc-8cc1-3feffd87d548","namespace":null,"metadata":{"text":"Peter Piper picked a peck of pickled peppers"},"values":[0.2321,0.8121,0.6315,0.6151,0.4121,0.1512,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}]`
		),
	},
	{
		name: "Images",
		scriptPath: "images.js",
		mixedModeSessionConfig: {
			IMAGES: {
				type: "images",
			},
		},
		miniflareConfig: (connection) => ({
			images: {
				binding: "IMAGES",
				mixedModeConnectionString: connection,
			},
		}),
		match: expect.stringContaining(`image/avif`),
	},
	{
		name: "Dispatch Namespace",
		scriptPath: "dispatch-namespace.js",
		setup: async (helper) => {
			const namespace = await helper.dispatchNamespace(false);

			const customerWorkerName = "mixed-mode-test-customer-worker";
			await helper.seed({
				"customer-worker.js": dedent/* javascript */ `
					export default {
						fetch(request) {
							return new Response("Hello from customer worker")
						}
					}
				`,
			});
			await helper.run(
				`wrangler deploy customer-worker.js --name ${customerWorkerName} --compatibility-date 2025-01-01 --dispatch-namespace ${namespace}`
			);

			return namespace;
		},
		mixedModeSessionConfig: (namespace) => ({
			DISPATCH: {
				type: "dispatch_namespace",
				namespace: namespace,
			},
		}),
		miniflareConfig: (connection, namespace) => ({
			dispatchNamespaces: {
				DISPATCH: {
					namespace: namespace,
					mixedModeConnectionString: connection,
				},
			},
		}),
		match: expect.stringMatching(/Hello from customer worker/),
	},
];
describe.each(testCases)("Mixed Mode for $name", (testCase) => {
	let helper: WranglerE2ETestHelper;
	beforeEach(() => {
		helper = new WranglerE2ETestHelper();
	});
	it("enabled", async () => {
		const { experimental_startMixedModeSession } =
			await helper.importWrangler();
		const { Miniflare } = await helper.importMiniflare();
		await helper.seed(
			path.resolve(__dirname, "./seed-files/mixed-mode-workers")
		);
		const setupResult = await testCase.setup?.(helper);

		const mixedModeSession = await experimental_startMixedModeSession(
			typeof testCase.mixedModeSessionConfig === "function"
				? /* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */
					testCase.mixedModeSessionConfig(setupResult!)
				: testCase.mixedModeSessionConfig
		);

		const mf = new Miniflare({
			compatibilityDate: "2025-01-01",
			// @ts-expect-error TS doesn't like the spreading of miniflareConfig
			modules: true,
			scriptPath: path.resolve(helper.tmpPath, testCase.scriptPath),
			modulesRoot: helper.tmpPath,
			...testCase.miniflareConfig(
				mixedModeSession.mixedModeConnectionString,
				/* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */
				setupResult!
			),
		});
		expect(await (await mf.dispatchFetch("http://example.com")).text()).toEqual(
			testCase.match
		);
	});
	// Ensure the test case _relies_ on Mixed Mode, and fails in regular local dev
	it(
		"fails when disabled",
		// Turn off retries because this test is expected to fail
		{ retry: 0, fails: true },
		async () => {
			const { Miniflare } = await helper.importMiniflare();
			await helper.seed(path.resolve(__dirname, "./mixed-mode-test-workers"));

			const mf = new Miniflare({
				compatibilityDate: "2025-01-01",
				// @ts-expect-error TS doesn't like the spreading of miniflareConfig
				modules: true,
				scriptPath: path.resolve(helper.tmpPath, testCase.scriptPath),
				modulesRoot: helper.tmpPath,
				// @ts-expect-error Deliberately passing in undefined here to turn off Mixed Mode
				...testCase.miniflareConfig(undefined),
			});
			expect(
				await (await mf.dispatchFetch("http://example.com")).text()
			).toStrictEqual(testCase.match);
		}
	);
});
