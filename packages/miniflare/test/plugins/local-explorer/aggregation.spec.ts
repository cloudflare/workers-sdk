import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, test } from "vitest";
import { CorePaths } from "../../../src/workers/core/constants";
import {
	disposeWithRetry,
	singleModuleManifest,
	useTmp,
	waitForWorkersInRegistry,
} from "../../test-shared";

const BASE_URL = `http://localhost${CorePaths.EXPLORER}/api`;

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
			inspectorPort: 0,
			unsafeLocalExplorer: true,
			unsafeDevRegistryPath: registryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "worker-a",
						compatibilityDate: "2025-01-01",
						manifest: singleModuleManifest(`
				export class MyDO {
					constructor(state) { this.state = state; }
					async fetch() { return new Response("DO A"); }
				}
				export default { fetch() { return new Response("Worker A"); } }
			`),
						env: {
							KV_A_1: { type: "kv", id: "kv-a-1" },
							KV_A_2: { type: "kv", id: "kv-a-2" },
							DB_A: { type: "d1", id: "db-a" },
							MY_DO: {
								type: "durable-object",
								worker: "worker-a",
								exportName: "MyDO",
							},
							BUCKET_A: { type: "r2", name: "bucket-a" },
						},
						exports: {
							MyDO: { type: "durable-object", storage: "legacy-kv" },
						},
					},
				},
			],
		});

		instanceB = new Miniflare({
			inspectorPort: 0,
			unsafeLocalExplorer: true,
			unsafeDevRegistryPath: registryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "worker-b",
						compatibilityDate: "2025-01-01",
						manifest: singleModuleManifest(`
				export class OtherDO {
					constructor(state) { this.state = state; }
					async fetch() { return new Response("DO B"); }
				}
				export default { fetch() { return new Response("Worker B"); } }
			`),
						env: {
							KV_B_1: { type: "kv", id: "kv-b-1" },
							DB_B: { type: "d1", id: "db-b" },
							OTHER_DO: {
								type: "durable-object",
								worker: "worker-b",
								exportName: "OtherDO",
							},
							BUCKET_B: { type: "r2", name: "bucket-b" },
						},
						exports: {
							OtherDO: { type: "durable-object", storage: "legacy-kv" },
						},
					},
				},
			],
		});
		await instanceA.ready;
		await instanceB.ready;

		// Wait for both instances to register in the dev registry
		await waitForWorkersInRegistry(registryPath, ["worker-a", "worker-b"]);
	});

	afterAll(async () => {
		await Promise.all([
			disposeWithRetry(instanceA),
			disposeWithRetry(instanceB),
		]);
		removeDirSync(registryPath);
	});

	describe("KV namespace aggregation", () => {
		test("only lists local KV namespaces without shared storage", async ({
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
				  ],
				  "result_info": {
				    "count": 2,
				  },
				}
			`);
		});

		test("only lists its local KV namespaces from instance B", async ({
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
				      "id": "kv-b-1",
				      "title": "KV_B_1",
				    },
				  ],
				  "result_info": {
				    "count": 1,
				  },
				}
			`);
		});

		test("resolves arbitrary KV namespace IDs locally", async ({ expect }) => {
			const kvB = await instanceB.getKVNamespace("KV_B_1");
			await kvB.put("peer-key-1", "value1");

			const response = await instanceA.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/kv-b-1/keys`
			);
			const data = await response.json();

			expect(data).toMatchObject({
				success: true,
				result: [],
			});
		});

		test("does not read an arbitrary KV namespace ID from a peer", async ({
			expect,
		}) => {
			const kvB = await instanceB.getKVNamespace("KV_B_1");
			await kvB.put("peer-value-key", "peer-value-content");

			const response = await instanceA.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/kv-b-1/values/peer-value-key`
			);

			expect(response.status).toBe(404);
			expect(await response.json()).toMatchObject({
				errors: [expect.objectContaining({ code: 10009 })],
				success: false,
			});
		});

		test("writes an arbitrary KV namespace ID locally", async ({ expect }) => {
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
			expect(await kvB.get("cross-write-key")).toBeNull();
			const localResponse = await instanceA.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/kv-b-1/values/cross-write-key`
			);
			expect(await localResponse.text()).toBe("cross-written-value");
		});

		test("does not delete from an arbitrary KV namespace ID on a peer", async ({
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

			expect(await kvB.get("to-delete-key")).toBe("value");
		});

		test("returns an empty list for an arbitrary KV namespace ID", async ({
			expect,
		}) => {
			const response = await instanceA.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/non-existent/keys`
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				result: [],
				success: true,
			});
		});
	});

	describe("D1 database aggregation", () => {
		test("only lists local D1 databases without shared storage", async ({
			expect,
		}) => {
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
				  ],
				  "result_info": {
				    "count": 1,
				  },
				}
			`);
		});

		test("resolves arbitrary D1 database IDs locally", async ({ expect }) => {
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
						sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'test_table'",
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
				  "rows": [],
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

	describe("r2 bucket aggregation", () => {
		test("only lists local R2 buckets without shared storage", async ({
			expect,
		}) => {
			const response = await instanceA.dispatchFetch(`${BASE_URL}/r2/buckets`);
			const data = (await response.json()) as ListResponse;

			expect(data.result).toMatchInlineSnapshot(`
				{
				  "buckets": [
				    {
				      "name": "bucket-a",
				    },
				  ],
				}
			`);
			expect(data.result_info).toMatchInlineSnapshot(`
				{
				  "count": 1,
				}
			`);

			const responseB = await instanceB.dispatchFetch(`${BASE_URL}/r2/buckets`);
			const dataB = (await responseB.json()) as ListResponse;
			expect(dataB.result).toMatchInlineSnapshot(`
				{
				  "buckets": [
				    {
				      "name": "bucket-b",
				    },
				  ],
				}
			`);
		});
	});
});

describe("Multi-worker peer deduplication", () => {
	let registryPath: string;
	let instanceA: Miniflare;
	let instanceB: Miniflare;
	let instanceC: Miniflare;
	let instanceD: Miniflare;

	beforeAll(async () => {
		registryPath = mkdtempSync(path.join(tmpdir(), "mf-registry-multiworker-"));
		const persistencePath = await useTmp();

		instanceA = new Miniflare({
			inspectorPort: 0,
			unsafeLocalExplorer: true,
			unsafeEnableSharedStorage: true,
			resourcePersistencePath: persistencePath,
			isolatedResourcePersistencePath: await useTmp(),
			unsafeDevRegistryPath: registryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "worker-a",
						compatibilityDate: "2025-01-01",
						manifest: singleModuleManifest(
							`export default { fetch() { return new Response("Worker A"); } }`
						),
						env: {
							KV_A: { type: "kv", id: "kv-a" },
						},
					},
				},
			],
		});
		await instanceA.ready;

		// Instance B: TWO workers in the same Miniflare process
		// Both register in the dev registry with the same host:port
		instanceB = new Miniflare({
			inspectorPort: 0,
			unsafeLocalExplorer: true,
			unsafeEnableSharedStorage: true,
			resourcePersistencePath: persistencePath,
			isolatedResourcePersistencePath: await useTmp(),
			unsafeDevRegistryPath: registryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "worker-b1",
						compatibilityDate: "2025-01-01",
						manifest: singleModuleManifest(
							`export default { fetch() { return new Response("Worker B1"); } }`
						),
						env: {
							KV_B1: { type: "kv", id: "kv-b1" },
						},
					},
				},
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "worker-b2",
						compatibilityDate: "2025-01-01",
						manifest: singleModuleManifest(
							`export default { fetch() { return new Response("Worker B2"); } }`
						),
						env: {
							KV_B2: { type: "kv", id: "kv-b2" },
						},
					},
				},
			],
		});
		await instanceB.ready;

		// A separate peer advertises the same namespace as worker-b1. Since both
		// peers share storage, the namespace should only appear once.
		instanceD = new Miniflare({
			inspectorPort: 0,
			unsafeLocalExplorer: true,
			unsafeEnableSharedStorage: true,
			resourcePersistencePath: persistencePath,
			isolatedResourcePersistencePath: await useTmp(),
			unsafeDevRegistryPath: registryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "worker-d",
						compatibilityDate: "2025-01-01",
						manifest: singleModuleManifest(
							`export default { fetch() { return new Response("Worker D"); } }`
						),
						env: {
							KV_B1: { type: "kv", id: "kv-b1" },
						},
					},
				},
			],
		});
		await instanceD.ready;

		instanceC = new Miniflare({
			inspectorPort: 0,
			unsafeLocalExplorer: true,
			unsafeEnableSharedStorage: true,
			resourcePersistencePath: await useTmp(),
			isolatedResourcePersistencePath: await useTmp(),
			unsafeDevRegistryPath: registryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "worker-c",
						compatibilityDate: "2025-01-01",
						manifest: singleModuleManifest(
							`export default { fetch() { return new Response("Worker C"); } }`
						),
						env: {
							KV_C: { type: "kv", id: "kv-c" },
						},
					},
				},
			],
		});
		await instanceC.ready;

		// Wait for all workers to register in the dev registry
		await waitForWorkersInRegistry(registryPath, [
			"worker-a",
			"worker-b1",
			"worker-b2",
			"worker-c",
			"worker-d",
		]);
	});

	afterAll(async () => {
		await Promise.all([
			disposeWithRetry(instanceA),
			disposeWithRetry(instanceB),
			disposeWithRetry(instanceC),
			disposeWithRetry(instanceD),
		]);
		removeDirSync(registryPath);
	});

	test("only lists resources from peers in the same shared-storage scope", async ({
		expect,
	}) => {
		const response = await instanceA.dispatchFetch(
			`${BASE_URL}/storage/kv/namespaces`
		);
		const data = (await response.json()) as ListResponse;

		// The multi-worker process is fetched once, the duplicate kv-b1 advertised
		// by worker-d is collapsed, and kv-c's different storage scope is excluded.
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

describe("Same ID across multiple instances with different persistence directories", () => {
	let registryPath: string;
	let instanceA: Miniflare;
	let instanceB: Miniflare;

	beforeAll(async () => {
		registryPath = mkdtempSync(path.join(tmpdir(), "mf-registry-same-id-"));

		// Both instances use the SAME KV and D1 ids
		// but they have separate storage (different default persistence paths)
		// Helpfully, DOs require you to specify a script name, which explicitly
		// ties it to a specific instance.
		instanceA = new Miniflare({
			inspectorPort: 0,
			unsafeLocalExplorer: true,
			unsafeDevRegistryPath: registryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "worker-a",
						compatibilityDate: "2025-01-01",
						manifest: singleModuleManifest(
							`export default { fetch() { return new Response("Worker A"); } }`
						),
						env: {
							MY_KV: { type: "kv", id: "shared-kv-id" },
							MY_DB: { type: "d1", id: "shared-db-id" },
							MY_DO: {
								type: "durable-object",
								worker: "worker-a",
								exportName: "MyDO",
							},
						},
						exports: {
							MyDO: { type: "durable-object", storage: "legacy-kv" },
						},
					},
				},
			],
		});

		instanceB = new Miniflare({
			inspectorPort: 0,
			unsafeLocalExplorer: true,
			unsafeDevRegistryPath: registryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "worker-b",
						compatibilityDate: "2025-01-01",
						manifest: singleModuleManifest(
							`export default { fetch() { return new Response("Worker B"); } }`
						),
						env: {
							MY_KV: { type: "kv", id: "shared-kv-id" },
							MY_DB: { type: "d1", id: "shared-db-id" },
							MY_DO: {
								type: "durable-object",
								worker: "worker-a",
								exportName: "MyDO",
							},
						},
					},
				},
			],
		});

		await instanceA.ready;
		await instanceB.ready;

		await waitForWorkersInRegistry(registryPath, ["worker-a", "worker-b"]);
	});

	afterAll(async () => {
		await Promise.all([
			disposeWithRetry(instanceA),
			disposeWithRetry(instanceB),
		]);
		removeDirSync(registryPath);
	});

	test("listing deduplicates namespaces with the same ID", async ({
		expect,
	}) => {
		let response = await instanceA.dispatchFetch(
			`${BASE_URL}/storage/kv/namespaces`
		);
		let data = (await response.json()) as ListResponse;
		expect(data.result_info?.count).toBe(1);

		response = await instanceA.dispatchFetch(`${BASE_URL}/d1/database`);
		data = (await response.json()) as ListResponse;
		expect(data.result_info?.count).toBe(1);

		response = await instanceA.dispatchFetch(
			`${BASE_URL}/workers/durable_objects/namespaces`
		);
		data = (await response.json()) as ListResponse;
		expect(data.result_info?.count).toBe(1);
	});

	// TODO: this is kind of a footgun - we should somehow check persistence paths
	// and warn if resources with the same id aren't using the same storage
	test("operations will prioritise local storage when ID exists locally", async ({
		expect,
	}) => {
		// Write different values to the same key in each instance's KV
		const kvA = await instanceA.getKVNamespace("MY_KV");
		const kvB = await instanceB.getKVNamespace("MY_KV");

		await kvA.put("test-key", "value-from-A");
		await kvB.put("test-key", "value-from-B");

		// Query from instance A - should get A's value, not B's
		const responseA = await instanceA.dispatchFetch(
			`${BASE_URL}/storage/kv/namespaces/shared-kv-id/values/test-key`
		);
		expect(await responseA.text()).toBe("value-from-A");

		// Query from instance B - should get B's value, not A's
		const responseB = await instanceB.dispatchFetch(
			`${BASE_URL}/storage/kv/namespaces/shared-kv-id/values/test-key`
		);
		expect(await responseB.text()).toBe("value-from-B");
	});
});

describe("Same ID across multiple instances with same persistence directories", () => {
	let registryPath: string;

	let instanceA: Miniflare;
	let instanceB: Miniflare;

	beforeAll(async () => {
		registryPath = mkdtempSync(path.join(tmpdir(), "mf-registry-same-id-"));
		const persistencePath = path.join(tmpdir(), "mf-persistence-same-id");

		// Both instances use the SAME KV and D1 ids
		// but they have separate storage (different default persistence paths)
		// Helpfully, DOs require you to specify a script name, which explicitly
		// ties it to a specific instance.
		instanceA = new Miniflare({
			inspectorPort: 0,
			unsafeLocalExplorer: true,
			unsafeDevRegistryPath: registryPath,
			resourcePersistencePath: persistencePath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "worker-a",
						compatibilityDate: "2025-01-01",
						manifest: singleModuleManifest(
							`export default { fetch() { return new Response("Worker A"); } }`
						),
						env: {
							MY_KV: { type: "kv", id: "shared-kv-id" },
						},
					},
				},
			],
		});

		// Wait for instanceA to be ready before starting instanceB to avoid
		// SQLite "database is locked" errors when both instances race to open
		// the same persistence file simultaneously.
		await instanceA.ready;

		instanceB = new Miniflare({
			inspectorPort: 0,
			unsafeLocalExplorer: true,
			unsafeDevRegistryPath: registryPath,
			resourcePersistencePath: persistencePath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "worker-b",
						compatibilityDate: "2025-01-01",
						manifest: singleModuleManifest(
							`export default { fetch() { return new Response("Worker B"); } }`
						),
						env: {
							MY_KV: { type: "kv", id: "shared-kv-id" },
						},
					},
				},
			],
		});

		await instanceB.ready;

		await waitForWorkersInRegistry(registryPath, ["worker-a", "worker-b"]);
	});

	afterAll(async () => {
		await Promise.all([
			disposeWithRetry(instanceA),
			disposeWithRetry(instanceB),
		]);
		removeDirSync(registryPath);
		removeDirSync(path.join(tmpdir(), "mf-persistence-same-id"));
	});

	test("operations will prioritise local storage when ID exists locally", async ({
		expect,
	}) => {
		// Write different values to the same key in each instance's KV
		const kvA = await instanceA.getKVNamespace("MY_KV");

		await kvA.put("test-key", "value-from-A");

		// Query from instance B - should get A's value
		const responseB = await instanceB.dispatchFetch(
			`${BASE_URL}/storage/kv/namespaces/shared-kv-id/values/test-key`
		);
		expect(await responseB.text()).toBe("value-from-A");
	});
});
