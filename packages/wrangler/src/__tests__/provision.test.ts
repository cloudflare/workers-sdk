import crypto from "node:crypto";
import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
// eslint-disable-next-line no-restricted-imports
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs, mockPrompt, mockSearch } from "./helpers/mock-dialogs";
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

vi.mock("../utils/fetch-secrets", () => ({
	fetchSecrets: async () => [],
}));

// Fix the random suffix so auto-generated names are deterministic in tests.
vi.spyOn(crypto, "randomBytes").mockReturnValue(
	Buffer.from("deadbeef", "hex") as unknown as ReturnType<
		typeof crypto.randomBytes
	>
);

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
	});
	afterEach(() => {
		clearDialogs();
	});

	describe("inheriting bindings from deployed worker settings", () => {
		it("should inherit KV, R2 and D1 bindings if they are found in settings", async () => {
			writeWranglerConfig({
				main: "index.js",
				kv_namespaces: [{ binding: "KV" }],
				r2_buckets: [{ binding: "R2" }],
				d1_databases: [{ binding: "D1" }],
			});
			mockGetSettings({
				result: {
					bindings: [
						{ type: "kv_namespace", name: "KV", namespace_id: "kv-id" },
						{ type: "r2_bucket", name: "R2", bucket_name: "test-bucket" },
						{ type: "d1", name: "D1", id: "d1-id" },
					],
				},
			});
			mockUploadWorkerRequest({
				expectedBindings: [
					{ name: "KV", type: "inherit" },
					{ name: "R2", type: "inherit" },
					{ name: "D1", type: "inherit" },
				],
			});

			await runWrangler("deploy");
			expect(std.out).toContain("env.KV (inherited)");
			expect(std.out).toContain("env.R2 (inherited)");
			expect(std.out).toContain("env.D1 (inherited)");
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("can inherit D1 binding when the database name matches", async () => {
			writeWranglerConfig({
				main: "index.js",
				d1_databases: [{ binding: "D1", database_name: "prefilled-d1-name" }],
			});
			mockGetSettings({
				result: {
					bindings: [{ type: "d1", name: "D1", id: "d1-id" }],
				},
			});
			mockGetD1Database("d1-id", { name: "prefilled-d1-name" });
			mockUploadWorkerRequest({
				expectedBindings: [{ name: "D1", type: "inherit" }],
			});

			await runWrangler("deploy");
			expect(std.out).toContain("env.D1 (inherited)");
		});

		it("will not inherit D1 binding when the database name has changed", async () => {
			writeWranglerConfig({
				main: "index.js",
				d1_databases: [{ binding: "D1", database_name: "new-d1-name" }],
			});
			mockGetSettings({
				result: {
					bindings: [{ type: "d1", name: "D1", id: "old-d1-id" }],
				},
			});
			// Handle all D1 database lookups by ID/name
			msw.use(
				http.get(
					"*/accounts/:accountId/d1/database/:databaseId",
					({ params }) => {
						if (params.databaseId === "old-d1-id") {
							return HttpResponse.json(
								createFetchResult({
									name: "old-d1-name",
									uuid: "old-d1-id",
								})
							);
						}
						// new-d1-name doesn't exist yet
						return HttpResponse.json(
							createFetchResult(null, false, [
								{ code: 7404, message: "database not found" },
							])
						);
					}
				),
				http.get("*/accounts/:accountId/d1/database", async () =>
					HttpResponse.json(
						createFetchResult([{ name: "old-d1-name", uuid: "old-d1-id" }])
					)
				)
			);
			mockCreateD1Database({
				assertName: "new-d1-name",
				resultId: "new-d1-id",
			});
			mockUploadWorkerRequest({
				expectedBindings: [{ name: "D1", type: "d1", id: "new-d1-id" }],
			});

			await runWrangler("deploy");
			expect(std.out).toContain("Provisioning D1 (D1 Database)");
			expect(std.out).toContain('Creating new D1 Database "new-d1-name"');
		});
	});

	describe("interactive provisioning", () => {
		it("can connect existing resources via search", async () => {
			writeWranglerConfig({
				main: "index.js",
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
				http.get("*/accounts/:accountId/d1/database", async () =>
					HttpResponse.json(
						createFetchResult([{ name: "db-name", uuid: "existing-d1-id" }])
					)
				),
				http.get("*/accounts/:accountId/r2/buckets", async () =>
					HttpResponse.json(
						createFetchResult({
							buckets: [{ name: "existing-bucket" }],
						})
					)
				)
			);

			mockSearch({
				text: "Select an existing KV Namespace or create a new one",
				result: "existing-kv-id",
			});
			mockSearch({
				text: "Select an existing D1 Database or create a new one",
				result: "existing-d1-id",
			});
			mockSearch({
				text: "Select an existing R2 Bucket or create a new one",
				result: "existing-bucket",
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
						bucket_name: "existing-bucket",
					},
					{ name: "D1", type: "d1", id: "existing-d1-id" },
				],
			});

			await runWrangler("deploy");
			expect(std.out).toContain("✨ KV provisioned");
			expect(std.out).toContain("✨ D1 provisioned");
			expect(std.out).toContain("✨ R2 provisioned");
			expect(std.out).toContain("All resources provisioned");
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("can create new resources via search", async () => {
			writeWranglerConfig({
				main: "index.js",
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
				http.get("*/accounts/:accountId/d1/database", async () =>
					HttpResponse.json(
						createFetchResult([{ name: "db-name", uuid: "existing-d1-id" }])
					)
				),
				http.get("*/accounts/:accountId/r2/buckets", async () =>
					HttpResponse.json(
						createFetchResult({
							buckets: [{ name: "existing-bucket" }],
						})
					)
				)
			);

			// Select "Create new" for all three
			mockSearch({
				text: "Select an existing KV Namespace or create a new one",
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

			mockSearch({
				text: "Select an existing D1 Database or create a new one",
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

			mockSearch({
				text: "Select an existing R2 Bucket or create a new one",
				result: "__WRANGLER_INTERNAL_NEW",
			});
			mockPrompt({
				text: "Enter a name for your new R2 Bucket",
				result: "new-r2",
			});
			mockCreateR2Bucket({ assertBucketName: "new-r2" });

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
					{ name: "D1", type: "d1", id: "new-d1-id" },
				],
			});

			await runWrangler("deploy");
			expect(std.out).toContain('Creating new KV Namespace "new-kv"');
			expect(std.out).toContain('Creating new D1 Database "new-d1"');
			expect(std.out).toContain('Creating new R2 Bucket "new-r2"');
			expect(std.err).toMatchInlineSnapshot(`""`);
		});
	});

	describe("name from config", () => {
		it("uses database_name from config to create D1 without prompting", async () => {
			writeWranglerConfig({
				main: "index.js",
				d1_databases: [{ binding: "D1", database_name: "my-database" }],
			});
			mockGetSettings();
			msw.use(
				http.get("*/accounts/:accountId/d1/database", async () =>
					HttpResponse.json(createFetchResult([]))
				)
			);
			mockGetD1Database("my-database", {}, true);
			mockCreateD1Database({
				assertName: "my-database",
				resultId: "new-d1-id",
			});
			mockUploadWorkerRequest({
				expectedBindings: [{ name: "D1", type: "d1", id: "new-d1-id" }],
			});

			await runWrangler("deploy");
			expect(std.out).toContain("Resource name found in config: my-database");
			expect(std.out).toContain('Creating new D1 Database "my-database"');
		});

		it("uses bucket_name from config to create R2 with jurisdiction", async () => {
			writeWranglerConfig({
				main: "index.js",
				r2_buckets: [
					{
						binding: "BUCKET",
						bucket_name: "my-bucket",
						jurisdiction: "eu",
					},
				],
			});
			mockGetSettings();
			msw.use(
				http.get("*/accounts/:accountId/r2/buckets", async () =>
					HttpResponse.json(createFetchResult({ buckets: [] }))
				)
			);
			mockGetR2Bucket("my-bucket", true);
			mockCreateR2Bucket({
				assertBucketName: "my-bucket",
				assertJurisdiction: "eu",
			});
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						name: "BUCKET",
						type: "r2_bucket",
						bucket_name: "my-bucket",
						jurisdiction: "eu",
					},
				],
			});

			await runWrangler("deploy");
			expect(std.out).toContain("Resource name found in config: my-bucket");
		});

		it("skips provisioning if D1 database_name matches an existing database", async () => {
			writeWranglerConfig({
				main: "index.js",
				d1_databases: [{ binding: "DB", database_name: "existing-db" }],
			});
			mockGetSettings();
			mockGetD1Database("existing-db", {
				name: "existing-db",
				uuid: "existing-d1-id",
			});
			mockUploadWorkerRequest({
				expectedBindings: [{ name: "DB", type: "d1", id: "existing-d1-id" }],
			});

			await runWrangler("deploy");
			expect(std.out).not.toContain("Provisioning");
		});

		it("skips provisioning if R2 bucket_name matches an existing bucket", async () => {
			writeWranglerConfig({
				main: "index.js",
				r2_buckets: [
					{
						binding: "BUCKET",
						bucket_name: "existing-bucket",
						jurisdiction: "eu",
					},
				],
			});
			mockGetSettings();
			mockGetR2Bucket("existing-bucket", false);
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						name: "BUCKET",
						type: "r2_bucket",
						bucket_name: "existing-bucket",
						jurisdiction: "eu",
					},
				],
			});

			await runWrangler("deploy");
			expect(std.out).not.toContain("Provisioning");
		});

		it("will provision if R2 jurisdiction changes", async () => {
			writeWranglerConfig({
				main: "index.js",
				r2_buckets: [
					{
						binding: "BUCKET",
						bucket_name: "existing-bucket",
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
							bucket_name: "existing-bucket",
							jurisdiction: "fedramp",
						},
					],
				},
			});
			msw.use(
				http.get("*/accounts/:accountId/r2/buckets", async () =>
					HttpResponse.json(createFetchResult({ buckets: [] }))
				)
			);
			mockGetR2Bucket("existing-bucket", true);
			mockCreateR2Bucket({
				assertBucketName: "existing-bucket",
				assertJurisdiction: "eu",
			});
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						name: "BUCKET",
						type: "r2_bucket",
						bucket_name: "existing-bucket",
						jurisdiction: "eu",
					},
				],
			});

			await runWrangler("deploy");
			expect(std.out).toContain("Provisioning BUCKET (R2 Bucket)");
		});
	});

	describe("CI auto-provisioning", () => {
		beforeEach(() => {
			setIsTTY(false);
		});

		it("auto-creates ciSafe bindings with generated names", async () => {
			writeWranglerConfig({
				main: "index.js",
				kv_namespaces: [{ binding: "KV" }],
				d1_databases: [{ binding: "D1" }],
				r2_buckets: [{ binding: "R2" }],
			});
			mockGetSettings();
			mockListKVNamespacesRequest();
			msw.use(
				http.get("*/accounts/:accountId/d1/database", async () =>
					HttpResponse.json(createFetchResult([]))
				),
				http.get("*/accounts/:accountId/r2/buckets", async () =>
					HttpResponse.json(createFetchResult({ buckets: [] }))
				)
			);

			// The random suffix is mocked to "deadbeef"
			mockCreateKVNamespace({
				assertTitle: "test-name-kv-deadbeef",
				resultId: "auto-kv-id",
			});
			mockCreateD1Database({
				assertName: "test-name-d1-deadbeef",
				resultId: "auto-d1-id",
			});
			mockCreateR2Bucket({
				assertBucketName: "test-name-r2-deadbeef",
			});

			mockUploadWorkerRequest({
				expectedBindings: [
					{
						name: "KV",
						type: "kv_namespace",
						namespace_id: "auto-kv-id",
					},
					{
						name: "R2",
						type: "r2_bucket",
						bucket_name: "test-name-r2-deadbeef",
					},
					{ name: "D1", type: "d1", id: "auto-d1-id" },
				],
			});

			await runWrangler("deploy");
			expect(std.out).toContain(
				'Creating new KV Namespace "test-name-kv-deadbeef"'
			);
			expect(std.out).toContain(
				'Creating new D1 Database "test-name-d1-deadbeef"'
			);
			expect(std.out).toContain(
				'Creating new R2 Bucket "test-name-r2-deadbeef"'
			);
			expect(std.out).toContain("All resources provisioned");
		});

		it("skips provisioning for queue bindings with queue name set", async () => {
			writeWranglerConfig({
				main: "index.js",
				queues: {
					producers: [{ binding: "QUEUE", queue: "my-queue" }],
				},
			});
			mockGetSettings();
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						name: "QUEUE",
						type: "queue",
						queue_name: "my-queue",
					},
				],
			});

			await runWrangler("deploy");
			expect(std.out).not.toContain("Provisioning");
		});

		it("auto-creates queue bindings without a name in CI", async () => {
			writeWranglerConfig({
				main: "index.js",
				queues: {
					producers: [{ binding: "QUEUE" }],
				},
			});
			mockGetSettings();
			mockListKVNamespacesRequest(); // for the KV load in HANDLERS
			msw.use(
				http.get("*/accounts/:accountId/queues", async () =>
					HttpResponse.json(createFetchResult([]))
				),
				http.post(
					"*/accounts/:accountId/queues",
					async ({ request }) => {
						const body = await request.json();
						expect(body).toEqual({
							queue_name: "test-name-queue-deadbeef",
						});
						return HttpResponse.json(
							createFetchResult({
								queue_name: "test-name-queue-deadbeef",
							})
						);
					},
					{ once: true }
				)
			);
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						name: "QUEUE",
						type: "queue",
						queue_name: "test-name-queue-deadbeef",
					},
				],
			});

			await runWrangler("deploy");
			expect(std.out).toContain(
				'Creating new Queue "test-name-queue-deadbeef"'
			);
		});
	});

	describe("pre-flight check", () => {
		beforeEach(() => {
			setIsTTY(false);
		});

		it("blocks all provisioning if any non-ciSafe binding cannot be resolved", async () => {
			writeWranglerConfig({
				main: "index.js",
				kv_namespaces: [{ binding: "KV" }],
				vectorize: [{ binding: "EMBEDDINGS" }],
			});
			mockGetSettings();

			// No KV or Vectorize should be created — pre-flight blocks everything
			await expect(runWrangler("deploy")).rejects.toThrow(
				"Could not auto-provision the following bindings"
			);
			expect(std.err).toContain("EMBEDDINGS (Vectorize Index)");
			expect(std.err).toContain("wrangler vectorize create");
			// The message should mention what WOULD work once resolved
			expect(std.err).toContain("KV (KV Namespace)");
			expect(std.err).toContain(
				"run wrangler deploy interactively in a terminal"
			);
		});

		it("blocks with multiple non-ciSafe bindings and lists all of them", async () => {
			writeWranglerConfig({
				main: "index.js",
				vectorize: [{ binding: "INDEX" }],
				hyperdrive: [{ binding: "DB" }],
			});
			mockGetSettings();

			await expect(runWrangler("deploy")).rejects.toThrow(
				"Could not auto-provision the following bindings"
			);
			expect(std.err).toContain("INDEX (Vectorize Index)");
			expect(std.err).toContain("DB (Hyperdrive Config)");
			expect(std.err).toContain("wrangler vectorize create");
			expect(std.err).toContain("wrangler hyperdrive create");
		});

		it("does not block if non-ciSafe binding is fully specified", async () => {
			writeWranglerConfig({
				main: "index.js",
				kv_namespaces: [{ binding: "KV" }],
				hyperdrive: [{ binding: "DB", id: "existing-hyperdrive-id" }],
			});
			mockGetSettings();
			mockListKVNamespacesRequest();

			mockCreateKVNamespace({
				assertTitle: "test-name-kv-deadbeef",
				resultId: "auto-kv-id",
			});
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						name: "KV",
						type: "kv_namespace",
						namespace_id: "auto-kv-id",
					},
					{
						name: "DB",
						type: "hyperdrive",
						id: "existing-hyperdrive-id",
					},
				],
			});

			await runWrangler("deploy");
			expect(std.out).toContain("✨ KV provisioned");
			expect(std.out).not.toContain("Provisioning DB");
		});
	});

	it("should error if used with a service environment", async () => {
		writeWranglerConfig({
			main: "index.js",
			legacy_env: false,
			kv_namespaces: [{ binding: "KV" }],
		});
		mockGetSettings();
		await expect(runWrangler("deploy")).rejects.toThrow(
			"Provisioning resources is not supported with a service environment"
		);
	});
});

// ---- MSW mock helpers ----

function mockCreateD1Database(
	options: { resultId?: string; assertName?: string } = {}
) {
	msw.use(
		http.post(
			"*/accounts/:accountId/d1/database",
			async ({ request }) => {
				if (options.assertName) {
					const body = await request.json();
					expect(body).toEqual({ name: options.assertName });
				}
				return HttpResponse.json(
					createFetchResult({
						uuid: options.resultId ?? "some-d1-id",
					})
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
					const body = await request.json();
					expect(body).toMatchObject({
						name: options.assertBucketName,
					});
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

function mockGetR2Bucket(bucketName: string, missing = false) {
	msw.use(
		http.get(
			"*/accounts/:accountId/r2/buckets/:bucketName",
			async ({ params }) => {
				expect(params.bucketName).toEqual(bucketName);
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
	databaseInfo: Record<string, unknown>,
	missing = false
) {
	msw.use(
		http.get(
			"*/accounts/:accountId/d1/database/:database_id",
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
