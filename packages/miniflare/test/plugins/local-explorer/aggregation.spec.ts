import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, test } from "vitest";
import { LOCAL_EXPLORER_API_PATH } from "../../../src/plugins/core/constants";
import { disposeWithRetry } from "../../test-shared";
import type { WorkerDefinition } from "../../../src/shared/dev-registry-types";

const BASE_URL = `http://localhost${LOCAL_EXPLORER_API_PATH}`;

interface ListResponse {
	result?: Array<{ id?: string; uuid?: string; [key: string]: unknown }>;
	result_info?: { count?: number };
}

/**
 * Helper to normalize list responses for snapshot testing.
 * Sorts results by id to ensure consistent ordering.
 */
function normalizeListResponse(data: ListResponse) {
	const sorted = [...(data.result ?? [])].sort((a, b) =>
		(a.id ?? a.uuid ?? "").localeCompare(b.id ?? b.uuid ?? "")
	);
	return {
		result: sorted,
		result_info: data.result_info,
	};
}

describe("Cross-process aggregation", () => {
	let registryPath: string;
	let instanceA: Miniflare;
	let instanceB: Miniflare;

	beforeAll(async () => {
		// Create a shared dev registry directory
		registryPath = mkdtempSync(path.join(tmpdir(), "mf-registry-"));

		instanceA = new Miniflare({
			name: "worker-a",
			inspectorPort: 0,
			compatibilityDate: "2025-01-01",
			modules: true,
			script: `
				export class MyDO {
					constructor(state) { this.state = state; }
					async fetch() { return new Response("DO A"); }
				}
				export default { fetch() { return new Response("Worker A"); } }
			`,
			unsafeLocalExplorer: true,
			unsafeDevRegistryPath: registryPath,
			kvNamespaces: {
				KV_A_1: "kv-a-1",
				KV_A_2: "kv-a-2",
			},
			d1Databases: {
				DB_A: "db-a",
			},
			durableObjects: {
				MY_DO: "MyDO",
			},
		});
		await instanceA.ready;

		instanceB = new Miniflare({
			name: "worker-b",
			inspectorPort: 0,
			compatibilityDate: "2025-01-01",
			modules: true,
			script: `
				export class OtherDO {
					constructor(state) { this.state = state; }
					async fetch() { return new Response("DO B"); }
				}
				export default { fetch() { return new Response("Worker B"); } }
			`,
			unsafeLocalExplorer: true,
			unsafeDevRegistryPath: registryPath,
			kvNamespaces: {
				KV_B_1: "kv-b-1",
			},
			d1Databases: {
				DB_B: "db-b",
			},
			durableObjects: {
				OTHER_DO: "OtherDO",
			},
		});
		await instanceB.ready;

		// Wait for both instances to register in the dev registry
		await new Promise((resolve) => setTimeout(resolve, 100));
	});

	afterAll(async () => {
		await Promise.all([
			disposeWithRetry(instanceA),
			disposeWithRetry(instanceB),
		]);
		removeDirSync(registryPath);
	});

	describe("KV namespace aggregation", () => {
		test("lists KV namespaces from both instances when queried from instance A", async ({
			expect,
		}) => {
			const response = await instanceA.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces`
			);
			const data = (await response.json()) as ListResponse;

			expect(normalizeListResponse(data)).toMatchInlineSnapshot(`
				{
				  "result": [
				    {
				      "id": "kv-a-1",
				      "title": "KV_A_1",
				    },
				    {
				      "id": "kv-a-2",
				      "title": "KV_A_2",
				    },
				    {
				      "id": "kv-b-1",
				      "title": "KV_B_1",
				    },
				  ],
				  "result_info": {
				    "count": 3,
				  },
				}
			`);
		});

		test("lists KV namespaces from both instances when queried from instance B", async ({
			expect,
		}) => {
			const response = await instanceB.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces`
			);
			const data = (await response.json()) as ListResponse;

			expect(normalizeListResponse(data)).toMatchInlineSnapshot(`
				{
				  "result": [
				    {
				      "id": "kv-a-1",
				      "title": "KV_A_1",
				    },
				    {
				      "id": "kv-a-2",
				      "title": "KV_A_2",
				    },
				    {
				      "id": "kv-b-1",
				      "title": "KV_B_1",
				    },
				  ],
				  "result_info": {
				    "count": 3,
				  },
				}
			`);
		});

		test("proxies KV key list to peer instance when namespace not found locally", async ({
			expect,
		}) => {
			const kvB = await instanceB.getKVNamespace("KV_B_1");
			await kvB.put("peer-key-1", "value1");

			const response = await instanceA.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/kv-b-1/keys`
			);
			const data = await response.json();

			expect(data).toMatchObject({
				success: true,
				result: expect.arrayContaining([
					expect.objectContaining({ name: "peer-key-1" }),
				]),
			});
		});

		test("proxies KV value get to peer instance when namespace not found locally", async ({
			expect,
		}) => {
			const kvB = await instanceB.getKVNamespace("KV_B_1");
			await kvB.put("peer-value-key", "peer-value-content");

			const response = await instanceA.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/kv-b-1/values/peer-value-key`
			);

			expect(response.status).toBe(200);
			expect(await response.text()).toMatchInlineSnapshot(
				`"peer-value-content"`
			);
		});

		test("proxies KV value put to peer instance when namespace not found locally", async ({
			expect,
		}) => {
			const response = await instanceA.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/kv-b-1/values/cross-write-key`,
				{
					method: "PUT",
					body: "cross-written-value",
				}
			);

			expect(response.status).toBe(200);
			await response.json(); // Consume body

			const kvB = await instanceB.getKVNamespace("KV_B_1");
			expect(await kvB.get("cross-write-key")).toMatchInlineSnapshot(
				`"cross-written-value"`
			);
		});

		test("proxies KV value delete to peer instance when namespace not found locally", async ({
			expect,
		}) => {
			const kvB = await instanceB.getKVNamespace("KV_B_1");
			await kvB.put("to-delete-key", "value");

			const response = await instanceA.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/kv-b-1/values/to-delete-key`,
				{ method: "DELETE" }
			);

			expect(response.status).toBe(200);
			await response.json(); // Consume body

			expect(await kvB.get("to-delete-key")).toBeNull();
		});

		test("returns 404 when resource not found locally or on peers", async ({
			expect,
		}) => {
			const response = await instanceA.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/non-existent/keys`
			);

			expect(response.status).toBe(404);
			expect(await response.json()).toMatchInlineSnapshot(`
			{
			  "errors": [
			    {
			      "code": 10013,
			      "message": "list keys: 'namespace not found'",
			    },
			  ],
			  "messages": [],
			  "result": null,
			  "success": false,
			}
		`);
		});
	});

	describe("D1 database aggregation", () => {
		test("lists D1 databases from both instances", async ({ expect }) => {
			const response = await instanceA.dispatchFetch(`${BASE_URL}/d1/database`);
			const data = (await response.json()) as ListResponse;

			expect(normalizeListResponse(data)).toMatchInlineSnapshot(`
				{
				  "result": [
				    {
				      "name": "DB_A",
				      "uuid": "db-a",
				      "version": "production",
				    },
				    {
				      "name": "DB_B",
				      "uuid": "db-b",
				      "version": "production",
				    },
				  ],
				  "result_info": {
				    "count": 2,
				  },
				}
			`);
		});

		test("proxies D1 raw query to peer instance when database not found locally", async ({
			expect,
		}) => {
			const dbB = await instanceB.getD1Database("DB_B");
			await dbB.exec(
				"CREATE TABLE IF NOT EXISTS test_table (id INTEGER PRIMARY KEY, name TEXT)"
			);
			await dbB.exec("DELETE FROM test_table"); // Clean slate
			await dbB.exec("INSERT INTO test_table (name) VALUES ('peer-row')");

			const response = await instanceA.dispatchFetch(
				`${BASE_URL}/d1/database/db-b/raw`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						sql: "SELECT name FROM test_table",
						params: [],
					}),
				}
			);

			expect(response.status).toBe(200);
			const data = (await response.json()) as {
				success: boolean;
				result: Array<{ results: { columns: string[]; rows: unknown[][] } }>;
			};
			expect(data.success).toBe(true);
			expect(data.result[0].results).toMatchInlineSnapshot(`
				{
				  "columns": [
				    "name",
				  ],
				  "rows": [
				    [
				      "peer-row",
				    ],
				  ],
				}
			`);
		});
	});

	describe("DO namespace aggregation", () => {
		test("lists DO namespaces from both instances", async ({ expect }) => {
			const response = await instanceA.dispatchFetch(
				`${BASE_URL}/workers/durable_objects/namespaces`
			);
			const data = (await response.json()) as ListResponse;
			const normalized = normalizeListResponse(data);

			// use_sqlite depends on migrations config, so we check structure without it
			expect(normalized.result?.map(({ id, name }) => ({ id, name })))
				.toMatchInlineSnapshot(`
				[
				  {
				    "id": "worker-a-MyDO",
				    "name": "worker-a_MyDO",
				  },
				  {
				    "id": "worker-b-OtherDO",
				    "name": "worker-b_OtherDO",
				  },
				]
			`);
			expect(normalized.result_info).toMatchInlineSnapshot(`
				{
				  "count": 2,
				}
			`);
		});
	});
});

describe("Multi-worker peer deduplication", () => {
	let registryPath: string;
	let instanceA: Miniflare;
	let instanceB: Miniflare;

	beforeAll(async () => {
		registryPath = mkdtempSync(path.join(tmpdir(), "mf-registry-multiworker-"));

		instanceA = new Miniflare({
			name: "worker-a",
			inspectorPort: 0,
			compatibilityDate: "2025-01-01",
			modules: true,
			script: `export default { fetch() { return new Response("Worker A"); } }`,
			unsafeLocalExplorer: true,
			unsafeDevRegistryPath: registryPath,
			kvNamespaces: {
				KV_A: "kv-a",
			},
		});
		await instanceA.ready;

		// Instance B: TWO workers in the same Miniflare process
		// Both register in the dev registry with the same host:port
		instanceB = new Miniflare({
			inspectorPort: 0,
			compatibilityDate: "2025-01-01",
			unsafeLocalExplorer: true,
			unsafeDevRegistryPath: registryPath,
			workers: [
				{
					name: "worker-b1",
					modules: true,
					script: `export default { fetch() { return new Response("Worker B1"); } }`,
					kvNamespaces: {
						KV_B1: "kv-b1",
					},
				},
				{
					name: "worker-b2",
					modules: true,
					script: `export default { fetch() { return new Response("Worker B2"); } }`,
					kvNamespaces: {
						KV_B2: "kv-b2",
					},
				},
			],
		});
		await instanceB.ready;

		await new Promise((resolve) => setTimeout(resolve, 100));
	});

	afterAll(async () => {
		await Promise.all([
			disposeWithRetry(instanceA),
			disposeWithRetry(instanceB),
		]);
		removeDirSync(registryPath);
	});

	test("does not duplicate results when peer has multiple workers", async ({
		expect,
	}) => {
		const response = await instanceA.dispatchFetch(
			`${BASE_URL}/storage/kv/namespaces`
		);
		const data = (await response.json()) as ListResponse;

		// Should have exactly 3 namespaces (kv-a, kv-b1, kv-b2)
		// NOT 5 which would happen without URL deduplication
		expect(normalizeListResponse(data)).toMatchInlineSnapshot(`
			{
			  "result": [
			    {
			      "id": "kv-a",
			      "title": "KV_A",
			    },
			    {
			      "id": "kv-b1",
			      "title": "KV_B1",
			    },
			    {
			      "id": "kv-b2",
			      "title": "KV_B2",
			    },
			  ],
			  "result_info": {
			    "count": 3,
			  },
			}
		`);
	});
});
