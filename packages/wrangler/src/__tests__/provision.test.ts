import { inputPrompt } from "@cloudflare/cli/interactive";
import { http, HttpResponse } from "msw";
import { prompt } from "../dialogs";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import {
	mockCreateKVNamespace,
	mockListKVNamespacesRequest,
} from "./helpers/mock-kv";
import { mockUploadWorkerRequest } from "./helpers/mock-upload-worker";
import { mockSubDomainRequest } from "./helpers/mock-workers-subdomain";
import {
	createFetchResult,
	msw,
	mswSuccessDeploymentScriptMetadata,
} from "./helpers/msw";
import { mswListNewDeploymentsLatestFull } from "./helpers/msw/handlers/versions";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import { writeWorkerSource } from "./helpers/write-worker-source";
import { writeWranglerConfig } from "./helpers/write-wrangler-config";
import type { Settings } from "../deployment-bundle/bindings";

vi.mock("@cloudflare/cli/interactive");
vi.mock("../dialogs");

describe("--x-provision", () => {
	const std = mockConsoleMethods();
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();

	beforeEach(() => {
		setIsTTY(true);
		msw.use(
			...mswSuccessDeploymentScriptMetadata,
			...mswListNewDeploymentsLatestFull
		);
		mockSubDomainRequest();
		writeWorkerSource();
		writeWranglerConfig({
			main: "index.js",
			kv_namespaces: [{ binding: "KV" }],
			r2_buckets: [{ binding: "R2" }],
			d1_databases: [{ binding: "D1" }],
		});
	});
	afterEach(() => {
		vi.clearAllMocks();
	});
	it("should inherit KV, R2 and D1 bindings if they could be found from the settings", async () => {
		mockGetSettings({
			result: {
				bindings: [
					{
						type: "kv_namespace",
						name: "KV",
						namespace_id: "kv-id",
					},
					{
						type: "r2_bucket",
						name: "R2",
						bucket_name: "test-bucket",
					},
					{
						type: "d1",
						name: "D1",
						id: "d1-id",
					},
				],
			},
		});
		mockUploadWorkerRequest({
			expectedBindings: [
				{
					name: "KV",
					type: "inherit",
				},
				{
					name: "R2",
					type: "inherit",
				},
				{
					name: "D1",
					type: "inherit",
				},
			],
		});

		await expect(runWrangler("deploy --x-provision")).resolves.toBeUndefined();
		expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your worker has access to the following bindings:
				- KV Namespaces:
				  - KV
				- D1 Databases:
				  - D1
				- R2 Buckets:
				  - R2
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.warn).toMatchInlineSnapshot(`""`);
	});

	describe("provisions KV, R2 and D1 bindings if not found in worker settings", () => {
		it("can provision KV, R2 and D1 bindings with existing resources", async () => {
			mockGetSettings();
			mockListKVNamespacesRequest({
				title: "test-kv",
				id: "existing-kv-id",
			});
			msw.use(
				http.get("*/accounts/:accountId/d1/database", async () => {
					return HttpResponse.json(
						createFetchResult([
							{
								name: "db-name",
								uuid: "existing-d1-id",
							},
						])
					);
				}),
				http.get("*/accounts/:accountId/r2/buckets", async () => {
					return HttpResponse.json(
						createFetchResult({
							buckets: [
								{
									name: "existing-bucket-name",
								},
							],
						})
					);
				})
			);

			vi.mocked(inputPrompt).mockImplementation(async (options) => {
				if (options.label === "KV") {
					return "existing-kv-id";
				} else if (options.label === "R2") {
					return "existing-bucket-name";
				} else if (options.label === "D1") {
					return "existing-d1-id";
				}
			});

			mockUploadWorkerRequest({
				expectedBindings: [
					{
						name: "KV",
						type: "kv_namespace",
						namespace_id: "existing-kv-id",
					},
					{
						name: "R2",
						type: "r2_bucket",
						bucket_name: "existing-bucket-name",
					},
					{
						name: "D1",
						type: "d1",
						id: "existing-d1-id",
					},
				],
			});

			await runWrangler("deploy --x-provision");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB

				The following bindings need to be provisioned:
				- KV Namespaces:
				  - KV
				- D1 Databases:
				  - D1
				- R2 Buckets:
				  - R2

				Provisioning KV (KV Namespace)...
				✨ KV provisioned with test-kv

				--------------------------------------

				Provisioning D1 (D1 Database)...
				✨ D1 provisioned with db-name

				--------------------------------------

				Provisioning R2 (R2 Bucket)...
				✨ R2 provisioned with existing-bucket-name

				--------------------------------------

				🎉 All resources provisioned, continuing with deployment...

				Worker Startup Time: 100 ms
				Your worker has access to the following bindings:
				- KV Namespaces:
				  - KV: existing-kv-id
				- D1 Databases:
				  - D1: existing-d1-id
				- R2 Buckets:
				  - R2: existing-bucket-name
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("can provision KV, R2 and D1 bindings with existing resources, and lets you search when there are too many to list", async () => {
			mockGetSettings();
			msw.use(
				http.get(
					"*/accounts/:accountId/storage/kv/namespaces",
					async () => {
						const result = [1, 2, 3, 4, 5].map((i) => ({
							title: `test-kv-${i}`,
							id: `existing-kv-id-${i}`,
						}));
						return HttpResponse.json(createFetchResult(result));
					},
					{ once: true }
				),
				http.get("*/accounts/:accountId/d1/database", async () => {
					const result = [1, 2, 3, 4, 5].map((i) => ({
						name: `test-d1-${i}`,
						uuid: `existing-d1-id-${i}`,
					}));
					return HttpResponse.json(createFetchResult(result));
				}),
				http.get("*/accounts/:accountId/r2/buckets", async () => {
					const result = [1, 2, 3, 4, 5].map((i) => ({
						name: `existing-bucket-${i}`,
					}));
					return HttpResponse.json(
						createFetchResult({
							buckets: result,
						})
					);
				})
			);

			vi.mocked(inputPrompt).mockImplementation(async (options) => {
				expect(options.type).toBe("select");
				expect(options.type === "select" && options.options[3]).toStrictEqual({
					label: "Other (too many to list)",
					value: "manual",
				});
				return "manual";
			});
			vi.mocked(prompt).mockImplementation(async (text) => {
				switch (text) {
					case "Enter the title or id for an existing KV Namespace":
						return "existing-kv-id-1";
					case "Enter the name or id for an existing D1 Database":
						return "existing-d1-id-1";
					case "Enter the name for an existing R2 Bucket":
						return "existing-bucket-1";
					default:
						throw new Error(`Unexpected prompt: ${text}`);
				}
			});

			mockUploadWorkerRequest({
				expectedBindings: [
					{
						name: "KV",
						type: "kv_namespace",
						namespace_id: "existing-kv-id-1",
					},
					{
						name: "R2",
						type: "r2_bucket",
						bucket_name: "existing-bucket-1",
					},
					{
						name: "D1",
						type: "d1",
						id: "existing-d1-id-1",
					},
				],
			});

			await runWrangler("deploy --x-provision");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB

				The following bindings need to be provisioned:
				- KV Namespaces:
				  - KV
				- D1 Databases:
				  - D1
				- R2 Buckets:
				  - R2

				Provisioning KV (KV Namespace)...
				✨ KV provisioned with test-kv-1

				--------------------------------------

				Provisioning D1 (D1 Database)...
				✨ D1 provisioned with test-d1-1

				--------------------------------------

				Provisioning R2 (R2 Bucket)...
				✨ R2 provisioned with existing-bucket-1

				--------------------------------------

				🎉 All resources provisioned, continuing with deployment...

				Worker Startup Time: 100 ms
				Your worker has access to the following bindings:
				- KV Namespaces:
				  - KV: existing-kv-id-1
				- D1 Databases:
				  - D1: existing-d1-id-1
				- R2 Buckets:
				  - R2: existing-bucket-1
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("can provision KV, R2 and D1 bindings with new resources", async () => {
			mockGetSettings();
			mockListKVNamespacesRequest({
				title: "test-kv",
				id: "existing-kv-id",
			});
			msw.use(
				http.get("*/accounts/:accountId/d1/database", async () => {
					return HttpResponse.json(
						createFetchResult([
							{
								name: "db-name",
								uuid: "existing-d1-id",
							},
						])
					);
				}),
				http.get("*/accounts/:accountId/r2/buckets", async () => {
					return HttpResponse.json(
						createFetchResult({
							buckets: [
								{
									name: "existing-bucket-name",
								},
							],
						})
					);
				})
			);

			vi.mocked(inputPrompt).mockImplementation(async (options) => {
				expect(options.type).toBe("select");
				const labels =
					options.type === "select" && options.options.map((o) => o.label);
				expect(labels).toContain("Create new");
				expect(labels).not.toContain("Other (too many to list)");
				return "new";
			});
			vi.mocked(prompt).mockImplementation(async (text, options) => {
				switch (text) {
					case "Enter a name for your new KV Namespace":
						expect(options?.defaultValue).toBe("test-name-kv");
						return "new-kv";
					case "Enter a name for your new D1 Database":
						expect(options?.defaultValue).toBe("test-name-d1");
						return "new-d1";
					case "Enter a name for your new R2 Bucket":
						expect(options?.defaultValue).toBe("test-name-r2");
						return "new-r2";
					default:
						throw new Error(`Unexpected prompt: ${text}`);
				}
			});
			mockCreateKVNamespace({
				assertTitle: "new-kv",
				resultId: "new-kv-id",
			});
			mockCreateD1Database({
				assertName: "new-d1",
				resultId: "new-d1-id",
			});
			mockCreateR2Bucket({
				assertBucketName: "new-r2",
			});

			mockUploadWorkerRequest({
				expectedBindings: [
					{
						name: "KV",
						type: "kv_namespace",
						namespace_id: "new-kv-id",
					},
					{
						name: "R2",
						type: "r2_bucket",
						bucket_name: "new-r2",
					},
					{
						name: "D1",
						type: "d1",
						id: "new-d1-id",
					},
				],
			});

			await runWrangler("deploy --x-provision");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB

				The following bindings need to be provisioned:
				- KV Namespaces:
				  - KV
				- D1 Databases:
				  - D1
				- R2 Buckets:
				  - R2

				Provisioning KV (KV Namespace)...
				🌀 Creating new KV Namespace \\"new-kv\\"...
				✨ KV provisioned with new-kv

				--------------------------------------

				Provisioning D1 (D1 Database)...
				🌀 Creating new D1 Database \\"new-d1\\"...
				✨ D1 provisioned with new-d1

				--------------------------------------

				Provisioning R2 (R2 Bucket)...
				🌀 Creating new R2 Bucket \\"new-r2\\"...
				✨ R2 provisioned with new-r2

				--------------------------------------

				🎉 All resources provisioned, continuing with deployment...

				Worker Startup Time: 100 ms
				Your worker has access to the following bindings:
				- KV Namespaces:
				  - KV: new-kv-id
				- D1 Databases:
				  - D1: new-d1-id
				- R2 Buckets:
				  - R2: new-r2
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});
	});
});

function mockGetSettings(
	options: {
		result?: Settings;
		assertAccountId?: string;
		assertScriptName?: string;
	} = {}
) {
	msw.use(
		http.get(
			"*/accounts/:accountId/workers/scripts/:scriptName/settings",
			async ({ params }) => {
				if (options.assertAccountId) {
					expect(params.accountId).toEqual(options.assertAccountId);
				}

				if (options.assertScriptName) {
					expect(params.scriptName).toEqual(options.assertScriptName);
				}

				if (!options.result) {
					return new Response(null, { status: 404 });
				}

				return HttpResponse.json({
					success: true,
					errors: [],
					messages: [],
					result: options.result,
				});
			}
		)
	);
}

function mockCreateD1Database(
	options: {
		resultId?: string;
		assertName?: string;
	} = {}
) {
	msw.use(
		http.post(
			"*/accounts/:accountId/d1/database",
			async ({ request }) => {
				if (options.assertName) {
					const requestBody = await request.json();
					expect(requestBody).toEqual({ name: options.assertName });
				}

				return HttpResponse.json(
					createFetchResult({ uuid: options.resultId ?? "some-d1-id" })
				);
			},
			{ once: true }
		)
	);
}

function mockCreateR2Bucket(
	options: {
		assertBucketName?: string;
	} = {}
) {
	msw.use(
		http.post(
			"*/accounts/:accountId/r2/buckets",
			async ({ request }) => {
				if (options.assertBucketName) {
					const requestBody = await request.json();
					expect(requestBody).toEqual({ name: options.assertBucketName });
				}
				return HttpResponse.json(createFetchResult({}));
			},
			{ once: true }
		)
	);
}
