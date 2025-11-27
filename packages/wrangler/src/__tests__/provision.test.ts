import { rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { http, HttpResponse } from "msw";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs, mockPrompt, mockSelect } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import {
	mockCreateKVNamespace,
	mockListKVNamespacesRequest,
} from "./helpers/mock-kv";
import { mockUploadWorkerRequest } from "./helpers/mock-upload-worker";
import { mockGetSettings } from "./helpers/mock-worker-settings";
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
import {
	writeRedirectedWranglerConfig,
	writeWranglerConfig,
} from "./helpers/write-wrangler-config";
import type { DatabaseInfo } from "../d1/types";

vi.mock("../utils/fetch-secrets", () => ({
	fetchSecrets: async () => [],
}));

describe("resource provisioning", () => {
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
		clearDialogs();
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

		await runWrangler("deploy --x-auto-create=false");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Your Worker has access to the following bindings:
			Binding                 Resource
			env.KV (inherited)      KV Namespace
			env.D1 (inherited)      D1 Database
			env.R2 (inherited)      R2 Bucket

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

			mockSelect({
				text: "Would you like to connect an existing KV Namespace or create a new one?",
				result: "existing-kv-id",
			});
			mockSelect({
				text: "Would you like to connect an existing D1 Database or create a new one?",
				result: "existing-d1-id",
			});
			mockSelect({
				text: "Would you like to connect an existing R2 Bucket or create a new one?",
				result: "existing-bucket-name",
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

			await runWrangler("deploy --x-auto-create=false");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB

				Experimental: The following bindings need to be provisioned:
				Binding        Resource
				env.KV         KV Namespace
				env.D1         D1 Database
				env.R2         R2 Bucket


				Provisioning KV (KV Namespace)...
				✨ KV provisioned 🎉

				Provisioning D1 (D1 Database)...
				✨ D1 provisioned 🎉

				Provisioning R2 (R2 Bucket)...
				✨ R2 provisioned 🎉

				Your Worker was deployed with provisioned resources. We've written the IDs of these resources to your config file, which you can choose to save or discard. Either way future deploys will continue to work.
				🎉 All resources provisioned, continuing with deployment...

				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                            Resource
				env.KV (existing-kv-id)            KV Namespace
				env.D1 (existing-d1-id)            D1 Database
				env.R2 (existing-bucket-name)      R2 Bucket

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

			mockSelect({
				text: "Would you like to connect an existing KV Namespace or create a new one?",
				result: "__WRANGLER_INTERNAL_SEARCH",
			});
			mockPrompt({
				text: "Enter the title or id for an existing KV Namespace",
				result: "existing-kv-id-1",
			});
			mockSelect({
				text: "Would you like to connect an existing D1 Database or create a new one?",
				result: "__WRANGLER_INTERNAL_SEARCH",
			});
			mockPrompt({
				text: "Enter the name or id for an existing D1 Database",
				result: "existing-d1-id-1",
			});
			mockSelect({
				text: "Would you like to connect an existing R2 Bucket or create a new one?",
				result: "__WRANGLER_INTERNAL_SEARCH",
			});
			mockPrompt({
				text: "Enter the name for an existing R2 Bucket",
				result: "existing-bucket-1",
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

			await runWrangler("deploy --x-auto-create=false");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB

				Experimental: The following bindings need to be provisioned:
				Binding        Resource
				env.KV         KV Namespace
				env.D1         D1 Database
				env.R2         R2 Bucket


				Provisioning KV (KV Namespace)...
				✨ KV provisioned 🎉

				Provisioning D1 (D1 Database)...
				✨ D1 provisioned 🎉

				Provisioning R2 (R2 Bucket)...
				✨ R2 provisioned 🎉

				Your Worker was deployed with provisioned resources. We've written the IDs of these resources to your config file, which you can choose to save or discard. Either way future deploys will continue to work.
				🎉 All resources provisioned, continuing with deployment...

				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                         Resource
				env.KV (existing-kv-id-1)       KV Namespace
				env.D1 (existing-d1-id-1)       D1 Database
				env.R2 (existing-bucket-1)      R2 Bucket

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

			mockSelect({
				text: "Would you like to connect an existing KV Namespace or create a new one?",
				result: "__WRANGLER_INTERNAL_NEW",
			});
			mockPrompt({
				text: "Enter a name for your new KV Namespace",
				result: "new-kv",
			});
			mockCreateKVNamespace({
				assertTitle: "new-kv",
				resultId: "new-kv-id",
			});

			mockSelect({
				text: "Would you like to connect an existing D1 Database or create a new one?",
				result: "__WRANGLER_INTERNAL_NEW",
			});
			mockPrompt({
				text: "Enter a name for your new D1 Database",
				result: "new-d1",
			});
			mockCreateD1Database({
				assertName: "new-d1",
				resultId: "new-d1-id",
			});

			mockSelect({
				text: "Would you like to connect an existing R2 Bucket or create a new one?",
				result: "__WRANGLER_INTERNAL_NEW",
			});
			mockPrompt({
				text: "Enter a name for your new R2 Bucket",
				result: "new-r2",
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

			await runWrangler("deploy --x-auto-create=false");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB

				Experimental: The following bindings need to be provisioned:
				Binding        Resource
				env.KV         KV Namespace
				env.D1         D1 Database
				env.R2         R2 Bucket


				Provisioning KV (KV Namespace)...
				🌀 Creating new KV Namespace \\"new-kv\\"...
				✨ KV provisioned 🎉

				Provisioning D1 (D1 Database)...
				🌀 Creating new D1 Database \\"new-d1\\"...
				✨ D1 provisioned 🎉

				Provisioning R2 (R2 Bucket)...
				🌀 Creating new R2 Bucket \\"new-r2\\"...
				✨ R2 provisioned 🎉

				Your Worker was deployed with provisioned resources. We've written the IDs of these resources to your config file, which you can choose to save or discard. Either way future deploys will continue to work.
				🎉 All resources provisioned, continuing with deployment...

				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                 Resource
				env.KV (new-kv-id)      KV Namespace
				env.D1 (new-d1-id)      D1 Database
				env.R2 (new-r2)         R2 Bucket

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);

			// IDs should be written back to the config file
			expect(await readFile("wrangler.toml", "utf-8")).toMatchInlineSnapshot(`
				"compatibility_date = \\"2022-01-12\\"
				name = \\"test-name\\"
				main = \\"index.js\\"

				[[kv_namespaces]]
				binding = \\"KV\\"
				id = \\"new-kv-id\\"

				[[r2_buckets]]
				binding = \\"R2\\"
				bucket_name = \\"new-r2\\"

				[[d1_databases]]
				binding = \\"D1\\"
				database_id = \\"new-d1-id\\"
				"
			`);
		});

		it("can provision KV, R2 and D1 bindings with new resources w/ redirected config", async () => {
			writeRedirectedWranglerConfig({
				main: "../index.js",
				compatibility_flags: ["nodejs_compat"],
				kv_namespaces: [{ binding: "KV" }],
				r2_buckets: [{ binding: "R2" }],
				d1_databases: [{ binding: "D1" }],
			});
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

			mockSelect({
				text: "Would you like to connect an existing KV Namespace or create a new one?",
				result: "__WRANGLER_INTERNAL_NEW",
			});
			mockPrompt({
				text: "Enter a name for your new KV Namespace",
				result: "new-kv",
			});
			mockCreateKVNamespace({
				assertTitle: "new-kv",
				resultId: "new-kv-id",
			});

			mockSelect({
				text: "Would you like to connect an existing D1 Database or create a new one?",
				result: "__WRANGLER_INTERNAL_NEW",
			});
			mockPrompt({
				text: "Enter a name for your new D1 Database",
				result: "new-d1",
			});
			mockCreateD1Database({
				assertName: "new-d1",
				resultId: "new-d1-id",
			});

			mockSelect({
				text: "Would you like to connect an existing R2 Bucket or create a new one?",
				result: "__WRANGLER_INTERNAL_NEW",
			});
			mockPrompt({
				text: "Enter a name for your new R2 Bucket",
				result: "new-r2",
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

			await runWrangler("deploy --x-auto-create=false");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB

				Experimental: The following bindings need to be provisioned:
				Binding        Resource
				env.KV         KV Namespace
				env.D1         D1 Database
				env.R2         R2 Bucket


				Provisioning KV (KV Namespace)...
				🌀 Creating new KV Namespace \\"new-kv\\"...
				✨ KV provisioned 🎉

				Provisioning D1 (D1 Database)...
				🌀 Creating new D1 Database \\"new-d1\\"...
				✨ D1 provisioned 🎉

				Provisioning R2 (R2 Bucket)...
				🌀 Creating new R2 Bucket \\"new-r2\\"...
				✨ R2 provisioned 🎉

				Your Worker was deployed with provisioned resources. We've written the IDs of these resources to your config file, which you can choose to save or discard. Either way future deploys will continue to work.
				🎉 All resources provisioned, continuing with deployment...

				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                 Resource
				env.KV (new-kv-id)      KV Namespace
				env.D1 (new-d1-id)      D1 Database
				env.R2 (new-r2)         R2 Bucket

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);

			// IDs should be written back to the user config file
			expect(await readFile("wrangler.toml", "utf-8")).toMatchInlineSnapshot(`
				"compatibility_date = \\"2022-01-12\\"
				name = \\"test-name\\"
				main = \\"index.js\\"

				[[kv_namespaces]]
				binding = \\"KV\\"
				id = \\"new-kv-id\\"

				[[r2_buckets]]
				binding = \\"R2\\"
				bucket_name = \\"new-r2\\"

				[[d1_databases]]
				binding = \\"D1\\"
				database_id = \\"new-d1-id\\"
				"
			`);

			rmSync(".wrangler/deploy/config.json");
		});

		it("can inject additional bindings in redirected config that aren't written back to disk", async () => {
			writeRedirectedWranglerConfig({
				main: "../index.js",
				compatibility_flags: ["nodejs_compat"],
				kv_namespaces: [{ binding: "KV" }, { binding: "PLATFORM_KV" }],
				r2_buckets: [{ binding: "R2" }],
				d1_databases: [{ binding: "D1" }],
			});
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
			mockCreateKVNamespace({
				assertTitle: "test-name-platform-kv",
				resultId: "test-name-platform-kv-id",
			});

			mockCreateKVNamespace({
				assertTitle: "test-name-kv",
				resultId: "test-name-kv-id",
			});

			mockCreateD1Database({
				assertName: "test-name-d1",
				resultId: "test-name-d1-id",
			});

			mockCreateR2Bucket({
				assertBucketName: "test-name-r2",
			});

			mockUploadWorkerRequest({
				expectedBindings: [
					{
						name: "KV",
						type: "kv_namespace",
						namespace_id: "test-name-kv-id",
					},
					{
						name: "PLATFORM_KV",
						type: "kv_namespace",
						namespace_id: "test-name-platform-kv-id",
					},
					{
						name: "R2",
						type: "r2_bucket",
						bucket_name: "test-name-r2",
					},
					{
						name: "D1",
						type: "d1",
						id: "test-name-d1-id",
					},
				],
			});

			await runWrangler("deploy");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB

				Experimental: The following bindings need to be provisioned:
				Binding                 Resource
				env.KV                  KV Namespace
				env.PLATFORM_KV         KV Namespace
				env.D1                  D1 Database
				env.R2                  R2 Bucket


				Provisioning KV (KV Namespace)...
				🌀 Creating new KV Namespace \\"test-name-kv\\"...
				✨ KV provisioned 🎉

				Provisioning PLATFORM_KV (KV Namespace)...
				🌀 Creating new KV Namespace \\"test-name-platform-kv\\"...
				✨ PLATFORM_KV provisioned 🎉

				Provisioning D1 (D1 Database)...
				🌀 Creating new D1 Database \\"test-name-d1\\"...
				✨ D1 provisioned 🎉

				Provisioning R2 (R2 Bucket)...
				🌀 Creating new R2 Bucket \\"test-name-r2\\"...
				✨ R2 provisioned 🎉

				Your Worker was deployed with provisioned resources. We've written the IDs of these resources to your config file, which you can choose to save or discard. Either way future deploys will continue to work.
				🎉 All resources provisioned, continuing with deployment...

				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                                         Resource
				env.KV (test-name-kv-id)                        KV Namespace
				env.PLATFORM_KV (test-name-platform-kv-id)      KV Namespace
				env.D1 (test-name-d1-id)                        D1 Database
				env.R2 (test-name-r2)                           R2 Bucket

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);

			// IDs should be written back to the user config file, except the injected PLATFORM_KV one
			expect(await readFile("wrangler.toml", "utf-8")).toMatchInlineSnapshot(`
				"compatibility_date = \\"2022-01-12\\"
				name = \\"test-name\\"
				main = \\"index.js\\"

				[[kv_namespaces]]
				binding = \\"KV\\"
				id = \\"test-name-kv-id\\"

				[[r2_buckets]]
				binding = \\"R2\\"
				bucket_name = \\"test-name-r2\\"

				[[d1_databases]]
				binding = \\"D1\\"
				database_id = \\"test-name-d1-id\\"
				"
			`);

			rmSync(".wrangler/deploy/config.json");
		});

		it("can prefill d1 database name from config file if provided", async () => {
			writeWranglerConfig({
				main: "index.js",
				d1_databases: [{ binding: "D1", database_name: "prefilled-d1-name" }],
			});
			mockGetSettings();
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
				})
			);
			mockGetD1Database("prefilled-d1-name", {}, true);

			// no name prompt
			mockCreateD1Database({
				assertName: "prefilled-d1-name",
				resultId: "new-d1-id",
			});

			mockUploadWorkerRequest({
				expectedBindings: [
					{
						name: "D1",
						type: "d1",
						id: "new-d1-id",
					},
				],
			});

			await runWrangler("deploy --x-auto-create=false");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB

				Experimental: The following bindings need to be provisioned:
				Binding        Resource
				env.D1         D1 Database


				Provisioning D1 (D1 Database)...
				Resource name found in config: prefilled-d1-name
				🌀 Creating new D1 Database \\"prefilled-d1-name\\"...
				✨ D1 provisioned 🎉

				Your Worker was deployed with provisioned resources. We've written the IDs of these resources to your config file, which you can choose to save or discard. Either way future deploys will continue to work.
				🎉 All resources provisioned, continuing with deployment...

				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                         Resource
				env.D1 (prefilled-d1-name)      D1 Database

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("can inherit d1 binding when the database name is provided", async () => {
			writeWranglerConfig({
				main: "index.js",
				d1_databases: [{ binding: "D1", database_name: "prefilled-d1-name" }],
			});
			mockGetSettings({
				result: {
					bindings: [
						{
							type: "d1",
							name: "D1",
							id: "d1-id",
						},
					],
				},
			});
			mockGetD1Database("d1-id", { name: "prefilled-d1-name" });
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						name: "D1",
						type: "inherit",
					},
				],
			});

			await runWrangler("deploy --x-auto-create=false");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                 Resource
				env.D1 (inherited)      D1 Database

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});

		it("will not inherit d1 binding when the database name is provided but has changed", async () => {
			// first deploy used old-d1-name/old-d1-id
			// now we provide a different database_name that doesn't match
			writeWranglerConfig({
				main: "index.js",
				d1_databases: [{ binding: "D1", database_name: "new-d1-name" }],
			});
			mockGetSettings({
				result: {
					bindings: [
						{
							type: "d1",
							name: "D1",
							id: "old-d1-id",
						},
					],
				},
			});
			msw.use(
				http.get("*/accounts/:accountId/d1/database", async () => {
					return HttpResponse.json(
						createFetchResult([
							{
								name: "old-d1-name",
								uuid: "old-d1-id",
							},
						])
					);
				})
			);
			mockGetD1Database("new-d1-name", {}, true);

			mockGetD1Database("old-d1-id", { name: "old-d1-name" });

			// no name prompt
			mockCreateD1Database({
				assertName: "new-d1-name",
				resultId: "new-d1-id",
			});

			mockUploadWorkerRequest({
				expectedBindings: [
					{
						name: "D1",
						type: "d1",
						id: "new-d1-id",
					},
				],
			});

			await runWrangler("deploy --x-auto-create=false");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB

				Experimental: The following bindings need to be provisioned:
				Binding        Resource
				env.D1         D1 Database


				Provisioning D1 (D1 Database)...
				Resource name found in config: new-d1-name
				🌀 Creating new D1 Database \\"new-d1-name\\"...
				✨ D1 provisioned 🎉

				Your Worker was deployed with provisioned resources. We've written the IDs of these resources to your config file, which you can choose to save or discard. Either way future deploys will continue to work.
				🎉 All resources provisioned, continuing with deployment...

				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                   Resource
				env.D1 (new-d1-name)      D1 Database

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("can prefill r2 bucket name from config file if provided", async () => {
			writeWranglerConfig({
				main: "index.js",
				r2_buckets: [
					{
						binding: "BUCKET",
						bucket_name: "prefilled-r2-name",
						// note it will also respect jurisdiction if provided, but wont prompt for it
						jurisdiction: "eu",
					},
				],
			});
			mockGetSettings();
			msw.use(
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
			mockGetR2Bucket("prefilled-r2-name", true);
			// no name prompt
			mockCreateR2Bucket({
				assertBucketName: "prefilled-r2-name",
				assertJurisdiction: "eu",
			});

			mockUploadWorkerRequest({
				expectedBindings: [
					{
						name: "BUCKET",
						type: "r2_bucket",
						bucket_name: "prefilled-r2-name",
						jurisdiction: "eu",
					},
				],
			});

			await runWrangler("deploy --x-auto-create=false");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB

				Experimental: The following bindings need to be provisioned:
				Binding            Resource
				env.BUCKET         R2 Bucket


				Provisioning BUCKET (R2 Bucket)...
				Resource name found in config: prefilled-r2-name
				🌀 Creating new R2 Bucket \\"prefilled-r2-name\\"...
				✨ BUCKET provisioned 🎉

				Your Worker was deployed with provisioned resources. We've written the IDs of these resources to your config file, which you can choose to save or discard. Either way future deploys will continue to work.
				🎉 All resources provisioned, continuing with deployment...

				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                                  Resource
				env.BUCKET (prefilled-r2-name (eu))      R2 Bucket

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("won't prompt to provision if an r2 bucket name belongs to an existing bucket", async () => {
			writeWranglerConfig({
				main: "index.js",
				r2_buckets: [
					{
						binding: "BUCKET",
						bucket_name: "existing-bucket-name",
						jurisdiction: "eu",
					},
				],
			});
			mockGetSettings();
			msw.use(
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
			mockGetR2Bucket("existing-bucket-name", false);
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						name: "BUCKET",
						type: "r2_bucket",
						bucket_name: "existing-bucket-name",
						jurisdiction: "eu",
					},
				],
			});

			await runWrangler("deploy --x-auto-create=false");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                                     Resource
				env.BUCKET (existing-bucket-name (eu))      R2 Bucket

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("won't prompt to provision if a D1 database name belongs to an existing database", async () => {
			writeWranglerConfig({
				main: "index.js",
				d1_databases: [
					{
						binding: "DB_NAME",
						database_name: "existing-db-name",
					},
				],
			});
			mockGetSettings();

			mockGetD1Database("existing-db-name", {
				name: "existing-db-name",
				uuid: "existing-d1-id",
			});

			mockUploadWorkerRequest({
				expectedBindings: [
					{
						name: "DB_NAME",
						type: "d1",
						id: "existing-d1-id",
					},
				],
			});

			await runWrangler("deploy");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                             Resource
				env.DB_NAME (existing-db-name)      D1 Database

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		// because buckets with the same name can exist in different jurisdictions
		it("will provision if the jurisdiction changes", async () => {
			writeWranglerConfig({
				main: "index.js",
				r2_buckets: [
					{
						binding: "BUCKET",
						bucket_name: "existing-bucket-name",
						jurisdiction: "eu",
					},
				],
			});
			mockGetSettings({
				result: {
					bindings: [
						{
							type: "r2_bucket",
							name: "BUCKET",
							bucket_name: "existing-bucket-name",
							jurisdiction: "fedramp",
						},
					],
				},
			});
			// list r2 buckets
			msw.use(
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
			// since the jurisdiction doesn't match, it should return not found
			mockGetR2Bucket("existing-bucket-name", true);
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						name: "BUCKET",
						type: "r2_bucket",
						bucket_name: "existing-bucket-name",
						jurisdiction: "eu",
					},
				],
			});
			mockCreateR2Bucket({
				assertJurisdiction: "eu",
				assertBucketName: "existing-bucket-name",
			});

			await runWrangler("deploy");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB

				Experimental: The following bindings need to be provisioned:
				Binding            Resource
				env.BUCKET         R2 Bucket


				Provisioning BUCKET (R2 Bucket)...
				Resource name found in config: existing-bucket-name
				🌀 Creating new R2 Bucket \\"existing-bucket-name\\"...
				✨ BUCKET provisioned 🎉

				Your Worker was deployed with provisioned resources. We've written the IDs of these resources to your config file, which you can choose to save or discard. Either way future deploys will continue to work.
				🎉 All resources provisioned, continuing with deployment...

				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                                     Resource
				env.BUCKET (existing-bucket-name (eu))      R2 Bucket

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});
	});

	it("should error if used with a service environment", async () => {
		writeWorkerSource();
		writeWranglerConfig({
			main: "index.js",
			legacy_env: false,
			kv_namespaces: [{ binding: "KV" }],
		});
		await expect(runWrangler("deploy --x-auto-create=false")).rejects.toThrow(
			"Provisioning resources is not supported with a service environment"
		);
	});
});

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
		assertJurisdiction?: string;
	} = {}
) {
	msw.use(
		http.post(
			"*/accounts/:accountId/r2/buckets",
			async ({ request }) => {
				if (options.assertBucketName) {
					const requestBody = await request.json();
					expect(requestBody).toMatchObject({ name: options.assertBucketName });
				}
				if (options.assertJurisdiction) {
					expect(request.headers.get("cf-r2-jurisdiction")).toEqual(
						options.assertJurisdiction
					);
				}
				return HttpResponse.json(createFetchResult({}));
			},
			{ once: true }
		)
	);
}

function mockGetR2Bucket(bucketName: string, missing: boolean = false) {
	msw.use(
		http.get(
			"*/accounts/:accountId/r2/buckets/:bucketName",
			async ({ params }) => {
				const { bucketName: bucketParam } = params;
				expect(bucketParam).toEqual(bucketName);
				if (missing) {
					return HttpResponse.json(
						createFetchResult(null, false, [
							{ code: 10006, message: "bucket not found" },
						])
					);
				}
				return HttpResponse.json(createFetchResult({}));
			},
			{ once: true }
		)
	);
}

function mockGetD1Database(
	databaseIdOrName: string,
	databaseInfo: Partial<DatabaseInfo>,
	missing: boolean = false
) {
	msw.use(
		http.get(
			`*/accounts/:accountId/d1/database/:database_id`,
			({ params }) => {
				expect(params.database_id).toEqual(databaseIdOrName);
				if (missing) {
					return HttpResponse.json(
						createFetchResult(null, false, [
							{ code: 7404, message: "database not found" },
						])
					);
				}
				return HttpResponse.json(createFetchResult(databaseInfo));
			},
			{ once: true }
		)
	);
}
