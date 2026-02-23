import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, test } from "vitest";
import { LOCAL_EXPLORER_API_PATH } from "../../../src/plugins/core/constants";
import { disposeWithRetry, useTmp } from "../../test-shared";

interface DONamespace {
	id: string;
	name: string;
	script: string;
	class: string;
	use_sqlite: boolean;
}

interface ListNamespacesResponse {
	success: boolean;
	result: DONamespace[];
	result_info: {
		count: number;
		page: number;
		per_page: number;
		total_count: number;
	};
	errors: Array<{ code: number; message: string }>;
	messages: Array<{ code: number; message: string }>;
}

interface DOObject {
	id: string;
	hasStoredData: boolean;
}

interface ListObjectsResponse {
	success: boolean;
	result: DOObject[];
	result_info: {
		count: number;
		cursor: string;
	};
	errors: Array<{ code: number; message: string }>;
	messages: Array<{ code: number; message: string }>;
}

const BASE_URL = `http://localhost${LOCAL_EXPLORER_API_PATH}`;

describe("Durable Objects API", () => {
	let mf: Miniflare;

	beforeAll(async () => {
		mf = new Miniflare({
			name: "my-worker",
			inspectorPort: 0,
			compatibilityDate: "2026-01-01",
			modules: true,
			script: `
				export class TestDO {
				}
				export class AnotherDO {
				}
				export default {
					fetch() {
						return new Response("user worker");
					}
				}
			`,
			unsafeLocalExplorer: true,
			durableObjects: {
				TEST_DO: "TestDO",
				ANOTHER_DO: { className: "AnotherDO", useSQLite: true },
			},
			// check that we're not including internal DOs used to implement other bindings
			kvNamespaces: {
				TEST_KV: "test-kv-id",
			},
		});
	});

	afterAll(async () => {
		await disposeWithRetry(mf);
	});

	describe("GET /workers/durable_objects/namespaces", () => {
		test("lists available DO namespaces", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/workers/durable_objects/namespaces`
			);

			expect(response.status).toBe(200);
			const data = (await response.json()) as ListNamespacesResponse;

			expect(data.success).toBe(true);
			expect(data.result).toBeInstanceOf(Array);
			expect(data.result.length).toBe(2);

			// Check that namespaces have the expected structure
			expect(data.result).toMatchInlineSnapshot(`
				[
				  {
				    "class": "AnotherDO",
				    "id": "my-worker-AnotherDO",
				    "name": "my-worker_AnotherDO",
				    "script": "my-worker",
				    "use_sqlite": true,
				  },
				  {
				    "class": "TestDO",
				    "id": "my-worker-TestDO",
				    "name": "my-worker_TestDO",
				    "script": "my-worker",
				    "use_sqlite": false,
				  },
				]
			`);
			expect(data.result_info).toMatchObject({
				count: 2,
				page: 1,
				per_page: 20,
				total_count: 2,
			});
		});

		test("respects pagination parameters", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/workers/durable_objects/namespaces?page=1&per_page=1`
			);

			expect(response.status).toBe(200);
			const data = (await response.json()) as ListNamespacesResponse;

			expect(data.result.length).toBe(1);
			expect(data.result_info).toMatchObject({
				count: 1,
				page: 1,
				per_page: 1,
				total_count: 2,
			});
		});
	});

	describe("GET /workers/durable_objects/namespaces/:namespace_id/objects", () => {
		test("returns 404 for non-existent namespace", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/workers/durable_objects/namespaces/non-existent/objects`
			);

			expect(response.status).toBe(404);
			const data = (await response.json()) as ListObjectsResponse;

			expect(data.success).toBe(false);
			expect(data.errors[0].message).toContain("Namespace not found");
		});
	});

	describe("can list DO objects by checking the file system", () => {
		let mf: Miniflare;
		const persistPath = path.join(__dirname, ".test-do-persist");

		beforeAll(async () => {
			// Clean up any previous test data
			await rm(persistPath, { recursive: true, force: true });
			await mkdir(persistPath, { recursive: true });

			mf = new Miniflare({
				name: "worker-with-do",
				inspectorPort: 0,
				compatibilityDate: "2025-01-01",
				modules: true,
				script: `
				export class TestDO {
					constructor(state, env) {
						this.state = state;
					}
					async fetch(request) {
						const url = new URL(request.url);
						if (url.pathname === "/put") {
							await this.state.storage.put("key", "value");
							return new Response("stored");
						}
						return new Response("ok");
					}
				}
				export default {
					async fetch(request, env) {
						const url = new URL(request.url);
						const name = url.searchParams.get("name") || "default";
						const id = env.TEST_DO.idFromName(name);
						const stub = env.TEST_DO.get(id);
						return stub.fetch(request);
					}
				}
			`,
				unsafeLocalExplorer: true,
				defaultPersistRoot: persistPath,
				durableObjects: {
					TEST_DO: "TestDO",
				},
			});

			// Create some DO objects by storing data
			const res1 = await mf.dispatchFetch("http://localhost/put?name=object1");
			await res1.text();
			const res2 = await mf.dispatchFetch("http://localhost/put?name=object2");
			await res2.text();
			const res3 = await mf.dispatchFetch("http://localhost/put?name=object3");
			await res3.text();
		});

		afterAll(async () => {
			await disposeWithRetry(mf);
			// Clean up test data
			await rm(persistPath, { recursive: true, force: true });
		});

		describe("GET /workers/durable_objects/namespaces/:namespace_id/objects", () => {
			test("lists objects with stored data", async ({ expect }) => {
				const response = await mf.dispatchFetch(
					`${BASE_URL}/workers/durable_objects/namespaces/worker-with-do-TestDO/objects`
				);

				expect(response.status).toBe(200);
				const data = (await response.json()) as ListObjectsResponse;

				expect(data.success).toBe(true);
				expect(data.result).toBeInstanceOf(Array);
				expect(data.result.length).toBe(3);

				expect(data.result).toMatchInlineSnapshot(`
					[
					  {
					    "hasStoredData": true,
					    "id": "21b74c1610ca545cee5981cbe7e52a6f5c9be93c25392761ac404bd6d0ed04c9",
					  },
					  {
					    "hasStoredData": true,
					    "id": "70bc3409f8f65b3f3e1b018dc0e208e8b6059f1c1e5bc7f7d993ab812e41f0f5",
					  },
					  {
					    "hasStoredData": true,
					    "id": "807932f392ad89b04b8e6c5cf6676d0a751df6e86d928dc3b1ce6152c9d99313",
					  },
					]
				`);
			});

			test("supports cursor pagination", async ({ expect }) => {
				// First request with limit=10
				const response1 = await mf.dispatchFetch(
					`${BASE_URL}/workers/durable_objects/namespaces/worker-with-do-TestDO/objects?limit=10`
				);
				const data1 = (await response1.json()) as ListObjectsResponse;

				// Get objects after the first one using cursor
				const response2 = await mf.dispatchFetch(
					`${BASE_URL}/workers/durable_objects/namespaces/worker-with-do-TestDO/objects?limit=10&cursor=${data1.result[0].id}`
				);

				expect(response2.status).toBe(200);
				const data2 = (await response2.json()) as ListObjectsResponse;

				expect(data2.success).toBe(true);
				// Cursor pagination should return objects after the cursor
				expect(data2.result.length).toBe(2);
				// The first result should not be the object we used as cursor
				expect(data2.result[0].id).not.toBe(data1.result[0].id);
			});
		});
	});

	describe("external and unbound DOs", () => {
		test("excludes external DOs (scriptName pointing to non-existent worker)", async ({
			expect,
		}) => {
			// When dev registry is enabled, external DOs are rewritten to use a proxy service
			// This test verifies they don't appear in the local explorer namespace list
			const unsafeDevRegistryPath = await useTmp();
			const mf = new Miniflare({
				name: "my-worker",
				inspectorPort: 0,
				compatibilityDate: "2026-01-01",
				modules: true,
				script: `
					export class LocalDO {}
					export default { fetch() { return new Response("ok"); } }
				`,
				unsafeLocalExplorer: true,
				unsafeDevRegistryPath,
				durableObjects: {
					LOCAL_DO: "LocalDO",
					// This DO references a worker not in this miniflare instance
					EXTERNAL_DO: { className: "ExternalDO", scriptName: "remote-worker" },
				},
			});

			try {
				const response = await mf.dispatchFetch(
					`${BASE_URL}/workers/durable_objects/namespaces`
				);

				expect(response.status).toBe(200);
				const data = (await response.json()) as ListNamespacesResponse;

				expect(data.success).toBe(true);
				// Should only include the local DO, not the external one
				expect(data.result.length).toBe(1);
				expect(data.result).toMatchInlineSnapshot(`
					[
					  {
					    "class": "LocalDO",
					    "id": "my-worker-LocalDO",
					    "name": "my-worker_LocalDO",
					    "script": "my-worker",
					    "use_sqlite": false,
					  },
					]
				`);
			} finally {
				await disposeWithRetry(mf);
			}
		});

		test("includes cross-worker DOs (scriptName pointing to local worker)", async ({
			expect,
		}) => {
			const mf = new Miniflare({
				inspectorPort: 0,
				unsafeLocalExplorer: true,
				workers: [
					{
						name: "worker-a",
						compatibilityDate: "2026-01-01",
						modules: true,
						script: `
							export class SharedDO {}
							export default { fetch() { return new Response("worker-a"); } }
						`,
						durableObjects: {
							MY_DO: "SharedDO",
						},
					},
					{
						name: "worker-b",
						compatibilityDate: "2026-01-01",
						modules: true,
						script: `
							export default { fetch() { return new Response("worker-b"); } }
						`,
						durableObjects: {
							// References the DO in worker-a
							MY_DO: { className: "SharedDO", scriptName: "worker-a" },
						},
					},
				],
			});

			try {
				const response = await mf.dispatchFetch(
					`${BASE_URL}/workers/durable_objects/namespaces`
				);

				expect(response.status).toBe(200);
				const data = (await response.json()) as ListNamespacesResponse;

				expect(data.success).toBe(true);
				// The DO should appear once (belonging to worker-a where it's defined)
				expect(data.result.length).toBe(1);
				expect(data.result[0]).toMatchObject({
					id: "worker-a-SharedDO",
					class: "SharedDO",
					script: "worker-a",
				});
			} finally {
				await disposeWithRetry(mf);
			}
		});

		test("includes unbound DOs (additionalUnboundDurableObjects)", async ({
			expect,
		}) => {
			const mf = new Miniflare({
				name: "my-worker",
				inspectorPort: 0,
				compatibilityDate: "2026-01-01",
				modules: true,
				script: `
					export class BoundDO {}
					export class UnboundDO {}
					export class UnboundSQLiteDO {}
					export default { fetch() { return new Response("ok"); } }
				`,
				unsafeLocalExplorer: true,
				durableObjects: {
					BOUND_DO: "BoundDO",
				},
				additionalUnboundDurableObjects: [
					{ className: "UnboundDO" },
					{ className: "UnboundSQLiteDO", useSQLite: true },
				],
			});

			try {
				const response = await mf.dispatchFetch(
					`${BASE_URL}/workers/durable_objects/namespaces`
				);

				expect(response.status).toBe(200);
				const data = (await response.json()) as ListNamespacesResponse;

				expect(data.success).toBe(true);
				// Should include both bound and unbound DOs
				expect(data.result.length).toBe(3);

				const ids = data.result.map((ns) => ns.id).sort();
				expect(ids).toEqual([
					"my-worker-BoundDO",
					"my-worker-UnboundDO",
					"my-worker-UnboundSQLiteDO",
				]);

				// Check SQLite flag is correctly set for unbound DO
				const unboundSQLiteDO = data.result.find(
					(ns) => ns.id === "my-worker-UnboundSQLiteDO"
				);
				expect(unboundSQLiteDO?.use_sqlite).toBe(true);
			} finally {
				await disposeWithRetry(mf);
			}
		});
	});

	describe("POST /workers/durable_objects/namespaces/:namespace_id/query", () => {
		let mf: Miniflare;
		const namespaceId = "query-worker-SqliteDO";

		beforeAll(async () => {
			mf = new Miniflare({
				name: "query-worker",
				inspectorPort: 0,
				compatibilityDate: "2026-01-01",
				compatibilityFlags: ["nodejs_compat"],
				modules: true,
				script: `
					import { DurableObject } from "cloudflare:workers";

					export class SqliteDO extends DurableObject {
						async fetch(request) {
							const url = new URL(request.url);
							const action = url.pathname.slice(1);

							if (action === "setup") {
								// Create a table and insert test data
								// The data can be customized via query params
								const dataset = url.searchParams.get("dataset") || "default";

								this.ctx.storage.sql.exec(\`
									CREATE TABLE IF NOT EXISTS users (
										id INTEGER PRIMARY KEY,
										name TEXT NOT NULL,
										email TEXT NOT NULL
									)
								\`);

								if (dataset === "alice") {
									this.ctx.storage.sql.exec(\`
										INSERT INTO users (id, name, email) VALUES
											(1, 'Alice', 'alice@example.com')
									\`);
								} else {
									// Default dataset with all users
									this.ctx.storage.sql.exec(\`
										INSERT INTO users (id, name, email) VALUES
											(1, 'Alice', 'alice@example.com'),
											(2, 'Bob', 'bob@example.com'),
											(3, 'Charlie', 'charlie@example.com')
									\`);
								}
								return new Response("setup complete");
							}

							return new Response("ok");
						}
					}

					export class NonSqliteDO extends DurableObject {
						async fetch(request) {
							return new Response("ok");
						}
					}

					export default {
						async fetch(request, env) {
							const url = new URL(request.url);
							const name = url.searchParams.get("name") || "test";
							const id = env.SQLITE_DO.idFromName(name);
							const stub = env.SQLITE_DO.get(id);
							return stub.fetch(request);
						}
					}
				`,
				unsafeLocalExplorer: true,
				durableObjects: {
					SQLITE_DO: { className: "SqliteDO", useSQLite: true },
					NON_SQLITE_DO: { className: "NonSqliteDO", useSQLite: false },
				},
			});

			// Initialize a DO instance and set up test data
			const res = await mf.dispatchFetch(
				"http://localhost/setup?name=test-object"
			);
			await res.text();
		});

		afterAll(async () => {
			await disposeWithRetry(mf);
		});

		test("queries by name - reads data written by user code", async ({
			expect,
		}) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/workers/durable_objects/namespaces/${namespaceId}/query`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						durable_object_name: "test-object",
						queries: [{ sql: "SELECT * FROM users ORDER BY id" }],
					}),
				}
			);

			expect(response.status).toBe(200);
			const data = (await response.json()) as QueryResponse;
			expect(data.result).toMatchInlineSnapshot(`
				[
				  {
				    "columns": [
				      "id",
				      "name",
				      "email",
				    ],
				    "meta": {
				      "rows_read": 3,
				      "rows_written": 0,
				    },
				    "rows": [
				      [
				        1,
				        "Alice",
				        "alice@example.com",
				      ],
				      [
				        2,
				        "Bob",
				        "bob@example.com",
				      ],
				      [
				        3,
				        "Charlie",
				        "charlie@example.com",
				      ],
				    ],
				  },
				]
			`);
		});

		test("queries by ID - reads data written by user code", async ({
			expect,
		}) => {
			// Get the DO ID from the list endpoint
			const listResponse = await mf.dispatchFetch(
				`${BASE_URL}/workers/durable_objects/namespaces/${namespaceId}/objects`
			);
			const listData = (await listResponse.json()) as ListObjectsResponse;
			const objectId = listData.result[0]?.id;

			expect(objectId).toBeDefined();

			const response = await mf.dispatchFetch(
				`${BASE_URL}/workers/durable_objects/namespaces/${namespaceId}/query`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						durable_object_id: objectId,
						queries: [{ sql: "SELECT name, email FROM users WHERE id = 2" }],
					}),
				}
			);

			expect(response.status).toBe(200);
			const data = (await response.json()) as QueryResponse;
			expect(data.result).toMatchInlineSnapshot(`
				[
				  {
				    "columns": [
				      "name",
				      "email",
				    ],
				    "meta": {
				      "rows_read": 1,
				      "rows_written": 0,
				    },
				    "rows": [
				      [
				        "Bob",
				        "bob@example.com",
				      ],
				    ],
				  },
				]
			`);
		});

		test("can make multiple queries", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/workers/durable_objects/namespaces/${namespaceId}/query`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						durable_object_name: "test-object",
						queries: [
							{ sql: "SELECT COUNT(*) as count FROM users" },
							{ sql: "SELECT name FROM users WHERE id = 1" },
							{ sql: "SELECT email FROM users WHERE id = 3" },
						],
					}),
				}
			);

			expect(response.status).toBe(200);
			const data = (await response.json()) as QueryResponse;
			expect(data.result).toMatchInlineSnapshot(`
				[
				  {
				    "columns": [
				      "count",
				    ],
				    "meta": {
				      "rows_read": 3,
				      "rows_written": 0,
				    },
				    "rows": [
				      [
				        3,
				      ],
				    ],
				  },
				  {
				    "columns": [
				      "name",
				    ],
				    "meta": {
				      "rows_read": 1,
				      "rows_written": 0,
				    },
				    "rows": [
				      [
				        "Alice",
				      ],
				    ],
				  },
				  {
				    "columns": [
				      "email",
				    ],
				    "meta": {
				      "rows_read": 1,
				      "rows_written": 0,
				    },
				    "rows": [
				      [
				        "charlie@example.com",
				      ],
				    ],
				  },
				]
			`);
		});

		test("parameterized query with user data", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/workers/durable_objects/namespaces/${namespaceId}/query`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						durable_object_name: "test-object",
						queries: [
							{
								sql: "SELECT name, email FROM users WHERE id = ?",
								params: [2],
							},
						],
					}),
				}
			);

			expect(response.status).toBe(200);
			const data = (await response.json()) as QueryResponse;
			expect(data.result).toMatchInlineSnapshot(`
				[
				  {
				    "columns": [
				      "name",
				      "email",
				    ],
				    "meta": {
				      "rows_read": 1,
				      "rows_written": 0,
				    },
				    "rows": [
				      [
				        "Bob",
				        "bob@example.com",
				      ],
				    ],
				  },
				]
			`);
		});

		test("each DO instance has isolated data", async ({ expect }) => {
			const setupAlice = await mf.dispatchFetch(
				"http://localhost/setup?name=alice-do&dataset=alice"
			);
			await setupAlice.text();

			// Query Alice's DO - should only have Alice
			const aliceResponse = await mf.dispatchFetch(
				`${BASE_URL}/workers/durable_objects/namespaces/${namespaceId}/query`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						durable_object_name: "alice-do",
						queries: [{ sql: "SELECT name FROM users" }],
					}),
				}
			);
			const aliceData = (await aliceResponse.json()) as QueryResponse;
			expect(aliceData.result).toMatchInlineSnapshot(`
				[
				  {
				    "columns": [
				      "name",
				    ],
				    "meta": {
				      "rows_read": 1,
				      "rows_written": 0,
				    },
				    "rows": [
				      [
				        "Alice",
				      ],
				    ],
				  },
				]
			`);

			// Verify the original test-object DO still has all 3 users
			const testResponse = await mf.dispatchFetch(
				`${BASE_URL}/workers/durable_objects/namespaces/${namespaceId}/query`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						durable_object_name: "test-object",
						queries: [{ sql: "SELECT COUNT(*) as count FROM users" }],
					}),
				}
			);
			const testData = (await testResponse.json()) as QueryResponse;
			expect(testData.result).toMatchInlineSnapshot(`
				[
				  {
				    "columns": [
				      "count",
				    ],
				    "meta": {
				      "rows_read": 3,
				      "rows_written": 0,
				    },
				    "rows": [
				      [
				        3,
				      ],
				    ],
				  },
				]
			`);
		});

		test("returns 404 for non-existent namespace", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/workers/durable_objects/namespaces/non-existent/query`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						durable_object_name: "test",
						queries: [{ sql: "SELECT 1" }],
					}),
				}
			);

			expect(response.status).toBe(404);
			const data = (await response.json()) as ErrorResponse;

			expect(data.success).toBe(false);
			expect(data.errors[0].message).toContain("Namespace not found");
		});

		test("returns 400 for non-SQLite namespace", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/workers/durable_objects/namespaces/query-worker-NonSqliteDO/query`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						durable_object_name: "test",
						queries: [{ sql: "SELECT 1" }],
					}),
				}
			);

			expect(response.status).toBe(400);
			const data = (await response.json()) as ErrorResponse;

			expect(data.success).toBe(false);
			expect(data.errors[0].message).toContain("does not use SQLite");
		});

		test("returns 400 for invalid DO ID format", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/workers/durable_objects/namespaces/${namespaceId}/query`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						durable_object_id: "not-a-valid-hex-id",
						queries: [{ sql: "SELECT 1" }],
					}),
				}
			);

			expect(response.status).toBe(400);
			const data = (await response.json()) as ErrorResponse;

			expect(data.success).toBe(false);
		});

		test("returns 400 for SQL syntax error", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/workers/durable_objects/namespaces/${namespaceId}/query`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						durable_object_name: "test-object",
						queries: [{ sql: "INVALID SQL SYNTAX" }],
					}),
				}
			);

			expect(response.status).toBe(400);
			const data = (await response.json()) as ErrorResponse;

			expect(data.success).toBe(false);
		});
	});
});

interface QueryResult {
	columns: string[];
	rows: unknown[][];
	meta: {
		rows_read: number;
		rows_written: number;
	};
}

interface QueryResponse {
	success: boolean;
	result: QueryResult[];
	errors: Array<{ code: number; message: string }>;
	messages: Array<{ code: number; message: string }>;
}

interface ErrorResponse {
	success: boolean;
	result: null;
	errors: Array<{ code: number; message: string }>;
	messages: Array<{ code: number; message: string }>;
}
