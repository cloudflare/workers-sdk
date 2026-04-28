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
import type { WorkerMetadataBinding } from "@cloudflare/workers-utils";

vi.mock("../utils/fetch-secrets", () => ({
	fetchSecrets: async () => [],
}));

// Fix the random suffix so auto-generated names are deterministic in tests.
vi.spyOn(crypto, "randomBytes").mockReturnValue(
	Buffer.from("cafe", "hex") as unknown as ReturnType<typeof crypto.randomBytes>
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

	describe("D1-specific inheritance logic", () => {
		// Generic per-handler inheritance is covered by the matrix test at the
		// bottom of this file. These tests cover D1's unusual behaviour: it
		// resolves the inherited binding's id back to a name, then compares to
		// config.database_name to decide whether to keep inheriting.

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

	describe("CI auto-provisioning (handler-specific edge cases)", () => {
		// Per-handler "auto-create in CI with generated name" is covered by the
		// matrix test below. These remaining tests cover queue-specific edge
		// cases that don't fit cleanly into the matrix because of queue's
		// `ensureQueuesExistByConfig` gating.
		beforeEach(() => {
			setIsTTY(false);
		});

		it("provisions queue by name-in-config when it doesn't exist", async () => {
			writeWranglerConfig({
				main: "index.js",
				queues: {
					producers: [{ binding: "QUEUE", queue: "new-queue" }],
				},
			});
			mockGetSettings();
			// Queue doesn't exist — should fall through to provisioning
			msw.use(
				http.get("*/accounts/:accountId/queues", () => {
					return HttpResponse.json(createFetchResult([]));
				}),
				http.post(
					"*/accounts/:accountId/queues",
					async ({ request }) => {
						const body = (await request.json()) as {
							queue_name: string;
						};
						expect(body.queue_name).toBe("new-queue");
						return HttpResponse.json(
							createFetchResult({ queue_name: "new-queue" })
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
						queue_name: "new-queue",
					},
				],
			});

			await runWrangler("deploy");
			expect(std.out).toContain('Creating new Queue "new-queue"');
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
							queue_name: "test-name-queue-cafe",
						});
						return HttpResponse.json(
							createFetchResult({
								queue_name: "test-name-queue-cafe",
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
						queue_name: "test-name-queue-cafe",
					},
				],
			});

			await runWrangler("deploy");
			expect(std.out).toContain('Creating new Queue "test-name-queue-cafe"');
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
			expect(std.err).toContain("in an interactive terminal");
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
				assertTitle: "test-name-kv-cafe",
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

	// ---- Matrix tests covering every provisionable binding type ----
	//
	// Each test case describes one binding type and what a minimal, fully-
	// specified, or inheritable configuration looks like for it. The tests
	// below iterate over subsets of this matrix to verify uniform behaviour
	// across handlers.

	type BindingCase = {
		/** Friendly label for the test output, e.g. "KV Namespace" */
		friendlyName: string;
		/** The user-facing binding name used in the config (e.g. "KV") */
		bindingName: string;
		/** Wrangler config fragment with only the binding defined, no id/name */
		emptyConfig: Record<string, unknown>;
		/** The deployed worker setting for inheritance tests */
		settingsBinding: WorkerMetadataBinding;
		/** Whether this handler auto-creates in CI (true for KV/D1/R2/... / false for Vectorize/Hyperdrive/...) */
		ciSafe: boolean;
		/** Wrangler config fragment when the opaque ID is fully specified — only defined for handlers that have an opaque ID field */
		fullyConfig?: Record<string, unknown>;
		/** Expected upload binding when fully specified (only defined alongside fullyConfig) */
		fullyExpectedBinding?: Record<string, unknown>;
		/** For non-ciSafe bindings, the wrangler command fragment expected in the pre-flight error hint */
		preflightHint?: string;
		/**
		 * For name-based handlers: fixture for the "name in config, resource
		 * exists → skip provisioning" scenario. The `mockExists` installs MSW
		 * handlers that return the resource as existing.
		 */
		connectExisting?: {
			config: Record<string, unknown>;
			expectedBinding: Record<string, unknown>;
			mockExists: () => void;
		};
		/**
		 * For ciSafe handlers: fixture for the "CI auto-create with generated
		 * name" scenario. `mockListAndCreate` installs list (empty) + create
		 * API handlers.
		 */
		ciAutoCreate?: {
			generatedName: string;
			mockListAndCreate: () => void;
			expectedBinding: Record<string, unknown>;
		};
	};

	const bindingCases: BindingCase[] = [
		{
			friendlyName: "KV Namespace",
			bindingName: "KV",
			emptyConfig: { kv_namespaces: [{ binding: "KV" }] },
			settingsBinding: {
				type: "kv_namespace",
				name: "KV",
				namespace_id: "kv-id",
			},
			ciSafe: true,
			fullyConfig: { kv_namespaces: [{ binding: "KV", id: "kv-id" }] },
			fullyExpectedBinding: {
				name: "KV",
				type: "kv_namespace",
				namespace_id: "kv-id",
			},
			// KV has no name-based lookup (id is opaque), so no connectExisting case
			ciAutoCreate: {
				generatedName: "test-name-kv-cafe",
				mockListAndCreate: () => {
					mockListKVNamespacesRequest();
					mockCreateKVNamespace({
						assertTitle: "test-name-kv-cafe",
						resultId: "auto-kv-id",
					});
				},
				expectedBinding: {
					name: "KV",
					type: "kv_namespace",
					namespace_id: "auto-kv-id",
				},
			},
		},
		{
			friendlyName: "D1 Database",
			bindingName: "DB",
			emptyConfig: { d1_databases: [{ binding: "DB" }] },
			settingsBinding: { type: "d1", name: "DB", id: "d1-id" },
			ciSafe: true,
			fullyConfig: {
				d1_databases: [{ binding: "DB", database_id: "d1-id" }],
			},
			fullyExpectedBinding: { name: "DB", type: "d1", id: "d1-id" },
			connectExisting: {
				config: {
					d1_databases: [{ binding: "DB", database_name: "existing-db" }],
				},
				expectedBinding: { name: "DB", type: "d1", id: "existing-d1-id" },
				mockExists: () => {
					mockGetD1Database("existing-db", {
						name: "existing-db",
						uuid: "existing-d1-id",
					});
				},
			},
			ciAutoCreate: {
				generatedName: "test-name-db-cafe",
				mockListAndCreate: () => {
					msw.use(
						http.get("*/accounts/:accountId/d1/database", () =>
							HttpResponse.json(createFetchResult([]))
						)
					);
					mockCreateD1Database({
						assertName: "test-name-db-cafe",
						resultId: "auto-d1-id",
					});
				},
				expectedBinding: { name: "DB", type: "d1", id: "auto-d1-id" },
			},
		},
		{
			friendlyName: "R2 Bucket",
			bindingName: "R2",
			emptyConfig: { r2_buckets: [{ binding: "R2" }] },
			settingsBinding: {
				type: "r2_bucket",
				name: "R2",
				bucket_name: "r2-bucket",
			},
			ciSafe: true,
			// R2 has no opaque id — bucket_name is the identity
			connectExisting: {
				config: {
					r2_buckets: [
						{
							binding: "R2",
							bucket_name: "existing-bucket",
							jurisdiction: "eu",
						},
					],
				},
				expectedBinding: {
					name: "R2",
					type: "r2_bucket",
					bucket_name: "existing-bucket",
					jurisdiction: "eu",
				},
				mockExists: () => {
					mockGetR2Bucket("existing-bucket", false);
				},
			},
			ciAutoCreate: {
				generatedName: "test-name-r2-cafe",
				mockListAndCreate: () => {
					msw.use(
						http.get("*/accounts/:accountId/r2/buckets", () =>
							HttpResponse.json(createFetchResult({ buckets: [] }))
						)
					);
					mockCreateR2Bucket({ assertBucketName: "test-name-r2-cafe" });
				},
				expectedBinding: {
					name: "R2",
					type: "r2_bucket",
					bucket_name: "test-name-r2-cafe",
				},
			},
		},
		{
			friendlyName: "AI Search Namespace",
			bindingName: "AIS",
			emptyConfig: { ai_search_namespaces: [{ binding: "AIS" }] },
			settingsBinding: {
				type: "ai_search_namespace",
				name: "AIS",
				namespace: "my-ns",
			},
			ciSafe: true,
			// AI Search has no list API; skipped for ciAutoCreate and connectExisting.
		},
		{
			friendlyName: "Queue",
			bindingName: "Q",
			emptyConfig: { queues: { producers: [{ binding: "Q" }] } },
			settingsBinding: { type: "queue", name: "Q", queue_name: "my-q" },
			ciSafe: true,
			connectExisting: {
				config: { queues: { producers: [{ binding: "Q", queue: "my-q" }] } },
				expectedBinding: { name: "Q", type: "queue", queue_name: "my-q" },
				mockExists: () => {
					msw.use(
						http.get("*/accounts/:accountId/queues", () =>
							HttpResponse.json(
								createFetchResult([{ queue_name: "my-q", queue_id: "q-id" }])
							)
						)
					);
				},
			},
			// Queue CI auto-create needs ensureQueuesExistByConfig gating, which is
			// exercised in a dedicated test — omitted here to keep this matrix tidy.
		},
		{
			friendlyName: "Dispatch Namespace",
			bindingName: "DISPATCH",
			emptyConfig: { dispatch_namespaces: [{ binding: "DISPATCH" }] },
			settingsBinding: {
				type: "dispatch_namespace",
				name: "DISPATCH",
				namespace: "my-ns",
			},
			ciSafe: true,
			connectExisting: {
				config: {
					dispatch_namespaces: [{ binding: "DISPATCH", namespace: "my-ns" }],
				},
				expectedBinding: {
					name: "DISPATCH",
					type: "dispatch_namespace",
					namespace: "my-ns",
				},
				mockExists: () => {
					msw.use(
						http.get("*/accounts/:accountId/workers/dispatch/namespaces", () =>
							HttpResponse.json(
								createFetchResult([
									{
										namespace_id: "ns-id",
										namespace_name: "my-ns",
									},
								])
							)
						)
					);
				},
			},
			ciAutoCreate: {
				generatedName: "test-name-dispatch-cafe",
				mockListAndCreate: () => {
					// load() lists namespaces (empty), then create POST returns it
					msw.use(
						http.get("*/accounts/:accountId/workers/dispatch/namespaces", () =>
							HttpResponse.json(createFetchResult([]))
						),
						http.post(
							"*/accounts/:accountId/workers/dispatch/namespaces",
							async ({ request }) => {
								const body = (await request.json()) as {
									name: string;
								};
								expect(body.name).toBe("test-name-dispatch-cafe");
								return HttpResponse.json(
									createFetchResult({
										namespace_id: "auto-ns-id",
										namespace_name: "test-name-dispatch-cafe",
									})
								);
							},
							{ once: true }
						)
					);
				},
				expectedBinding: {
					name: "DISPATCH",
					type: "dispatch_namespace",
					namespace: "test-name-dispatch-cafe",
				},
			},
		},
		{
			friendlyName: "Vectorize Index",
			bindingName: "IDX",
			emptyConfig: { vectorize: [{ binding: "IDX" }] },
			settingsBinding: {
				type: "vectorize",
				name: "IDX",
				index_name: "my-idx",
			},
			ciSafe: false,
			preflightHint: "wrangler vectorize create",
			connectExisting: {
				config: { vectorize: [{ binding: "IDX", index_name: "my-idx" }] },
				expectedBinding: {
					name: "IDX",
					type: "vectorize",
					index_name: "my-idx",
				},
				mockExists: () => {
					msw.use(
						http.get("*/accounts/:accountId/vectorize/v2/indexes", () =>
							HttpResponse.json(createFetchResult([{ name: "my-idx" }]))
						)
					);
				},
			},
		},
		{
			friendlyName: "Hyperdrive Config",
			bindingName: "HD",
			emptyConfig: { hyperdrive: [{ binding: "HD" }] },
			settingsBinding: { type: "hyperdrive", name: "HD", id: "hd-id" },
			ciSafe: false,
			fullyConfig: { hyperdrive: [{ binding: "HD", id: "hd-id" }] },
			fullyExpectedBinding: { name: "HD", type: "hyperdrive", id: "hd-id" },
			preflightHint: "wrangler hyperdrive create",
		},
		{
			friendlyName: "Pipeline",
			bindingName: "PIPE",
			emptyConfig: { pipelines: [{ binding: "PIPE" }] },
			// Note: metadata binding type is "pipelines" (plural), Binding union uses "pipeline"
			settingsBinding: {
				type: "pipelines",
				name: "PIPE",
				pipeline: "my-pipe",
			},
			ciSafe: false,
			preflightHint: "wrangler pipelines create",
			connectExisting: {
				config: { pipelines: [{ binding: "PIPE", pipeline: "my-pipe" }] },
				expectedBinding: {
					name: "PIPE",
					type: "pipelines",
					pipeline: "my-pipe",
				},
				mockExists: () => {
					msw.use(
						http.get("*/accounts/:accountId/pipelines/v1/pipelines", () =>
							HttpResponse.json(createFetchResult([{ name: "my-pipe" }]))
						)
					);
				},
			},
		},
		{
			friendlyName: "VPC Service",
			bindingName: "VPC",
			emptyConfig: { vpc_services: [{ binding: "VPC" }] },
			settingsBinding: {
				type: "vpc_service",
				name: "VPC",
				service_id: "svc-id",
			},
			ciSafe: false,
			fullyConfig: { vpc_services: [{ binding: "VPC", service_id: "svc-id" }] },
			fullyExpectedBinding: {
				name: "VPC",
				type: "vpc_service",
				service_id: "svc-id",
			},
			preflightHint: "wrangler vpc service create",
		},
		{
			friendlyName: "mTLS Certificate",
			bindingName: "CERT",
			emptyConfig: { mtls_certificates: [{ binding: "CERT" }] },
			settingsBinding: {
				type: "mtls_certificate",
				name: "CERT",
				certificate_id: "cert-id",
			},
			ciSafe: false,
			fullyConfig: {
				mtls_certificates: [{ binding: "CERT", certificate_id: "cert-id" }],
			},
			fullyExpectedBinding: {
				name: "CERT",
				type: "mtls_certificate",
				certificate_id: "cert-id",
			},
			preflightHint: "wrangler mtls-certificate upload",
		},
	];

	it.each(bindingCases)(
		"inherits $friendlyName binding when present in deployed worker settings",
		async ({ bindingName, emptyConfig, settingsBinding }) => {
			writeWranglerConfig({ main: "index.js", ...emptyConfig });
			mockGetSettings({ result: { bindings: [settingsBinding] } });
			mockUploadWorkerRequest({
				expectedBindings: [{ name: bindingName, type: "inherit" }],
			});

			await runWrangler("deploy");
			expect(std.out).toContain(`env.${bindingName} (inherited)`);
			expect(std.err).toBe("");
		}
	);

	it.each(bindingCases.filter((c) => c.fullyConfig))(
		"skips provisioning $friendlyName when its opaque id is fully specified",
		async ({ fullyConfig, fullyExpectedBinding }) => {
			writeWranglerConfig({ main: "index.js", ...fullyConfig });
			mockGetSettings();
			mockUploadWorkerRequest({
				expectedBindings: [fullyExpectedBinding as Record<string, unknown>],
			});

			await runWrangler("deploy");
			expect(std.out).not.toContain("Provisioning");
		}
	);

	it.each(bindingCases.filter((c) => !c.ciSafe && c.preflightHint))(
		"pre-flight blocks $friendlyName provisioning in CI when details are missing",
		async ({ bindingName, friendlyName, emptyConfig, preflightHint }) => {
			setIsTTY(false);
			writeWranglerConfig({ main: "index.js", ...emptyConfig });
			mockGetSettings();

			await expect(runWrangler("deploy")).rejects.toThrow(
				"Could not auto-provision the following bindings"
			);
			expect(std.err).toContain(`${bindingName} (${friendlyName})`);
			expect(std.err).toContain(preflightHint);
		}
	);

	it.each(
		bindingCases.flatMap((c) =>
			c.connectExisting ? [{ ...c, fixture: c.connectExisting }] : []
		)
	)(
		"connects existing $friendlyName resource when name-in-config already exists",
		async ({ fixture }) => {
			writeWranglerConfig({ main: "index.js", ...fixture.config });
			mockGetSettings();
			fixture.mockExists();
			mockUploadWorkerRequest({
				expectedBindings: [fixture.expectedBinding],
			});

			await runWrangler("deploy");
			// The provisioning flow detected an existing resource and skipped
			// creation entirely — no "Creating new X" output.
			expect(std.out).not.toMatch(/Creating new/);
		}
	);

	it.each(
		bindingCases.flatMap((c) =>
			c.ciSafe && c.ciAutoCreate ? [{ ...c, fixture: c.ciAutoCreate }] : []
		)
	)(
		"auto-creates $friendlyName in CI with a generated name",
		async ({ friendlyName, emptyConfig, fixture }) => {
			setIsTTY(false);
			writeWranglerConfig({ main: "index.js", ...emptyConfig });
			mockGetSettings();
			fixture.mockListAndCreate();
			mockUploadWorkerRequest({
				expectedBindings: [fixture.expectedBinding],
			});

			await runWrangler("deploy");
			expect(std.out).toContain(
				`Creating new ${friendlyName} "${fixture.generatedName}"`
			);
		}
	);

	describe("orphan warning", () => {
		beforeEach(() => {
			setIsTTY(false);
		});

		it("warns about created resources when a later resource fails to provision", async () => {
			writeWranglerConfig({
				main: "index.js",
				kv_namespaces: [{ binding: "KV" }],
				d1_databases: [{ binding: "DB" }],
			});
			mockGetSettings();
			mockListKVNamespacesRequest();
			msw.use(
				http.get("*/accounts/:accountId/d1/database", () =>
					HttpResponse.json(createFetchResult([]))
				)
			);
			// KV create succeeds
			mockCreateKVNamespace({
				resultId: "new-kv-id",
			});
			// D1 create fails
			msw.use(
				http.post("*/accounts/:accountId/d1/database", () =>
					HttpResponse.json(
						createFetchResult(null, false, [
							{ code: 9999, message: "quota exceeded" },
						])
					)
				)
			);

			await expect(runWrangler("deploy")).rejects.toThrow();
			// Should warn about the orphaned KV namespace with its ID
			expect(std.warn).toContain("may be orphaned");
			expect(std.warn).toContain("KV (KV Namespace)");
			expect(std.warn).toContain("new-kv-id");
		});
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
