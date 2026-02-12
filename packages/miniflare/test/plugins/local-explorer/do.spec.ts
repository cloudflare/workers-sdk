import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, test } from "vitest";
import { LOCAL_EXPLORER_API_PATH } from "../../../src/plugins/core/constants";
import { disposeWithRetry } from "../../test-shared";

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
				    "class": "TestDO",
				    "id": "my-worker-TestDO",
				    "name": "my-worker_TestDO",
				    "script": "my-worker",
				    "use_sqlite": false,
				  },
				  {
				    "class": "AnotherDO",
				    "id": "my-worker-AnotherDO",
				    "name": "my-worker_AnotherDO",
				    "script": "my-worker",
				    "use_sqlite": true,
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
});
