import { mkdtempSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, test } from "vitest";
import { CorePaths } from "../../../src/workers/core/constants";
import { disposeWithRetry, waitForWorkersInRegistry } from "../../test-shared";

const BASE_URL = `http://localhost${CorePaths.EXPLORER}/api`;

describe("Local Explorer API validation", () => {
	let mf: Miniflare;

	beforeAll(async () => {
		mf = new Miniflare({
			inspectorPort: 0,
			compatibilityDate: "2025-01-01",
			modules: true,
			script: `export default { fetch() { return new Response("user worker"); } }`,
			unsafeLocalExplorer: true,
			kvNamespaces: {
				TEST_KV: "test-kv-id",
			},
		});
	});

	afterAll(async () => {
		await disposeWithRetry(mf);
	});

	describe("query parameter validation", () => {
		test("returns 400 for invalid type in query parameter", async ({
			expect,
		}) => {
			// Test query validation on listKVKeys endpoint which still has query params
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/keys?limit=not-a-number`
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [
					{
						code: 10001,
						message:
							'limit: Expected query param to be number but received "not-a-number"',
					},
				],
			});
		});

		test("returns 400 for invalid value (number out of range)", async ({
			expect,
		}) => {
			// Test with limit which has a minimum of 10
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/keys?limit=0`
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [
					{
						code: 10001,
						message: "limit: Number must be greater than or equal to 10",
					},
				],
			});
		});

		test("returns 400 for limit exceeding maximum", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/keys?limit=1001`
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [
					{
						code: 10001,
						message: "limit: Number must be less than or equal to 1000",
					},
				],
			});
		});
	});

	describe("request body validation", () => {
		test("returns 400 for invalid body type", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/bulk/get`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ keys: "not-an-array" }),
				}
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [
					{
						code: 10001,
						message: "keys: Expected array, received string",
					},
				],
			});
		});

		test("returns 400 for missing required keys field", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/bulk/get`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({}),
				}
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [
					{
						code: 10001,
						message: "keys: Required",
					},
				],
			});
		});
	});

	describe("error response format", () => {
		test("validation error responses follow Cloudflare API format", async ({
			expect,
		}) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/test-kv-id/keys?limit=invalid`
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [
					{
						code: 10001,
						message:
							'limit: Expected query param to be number but received "invalid"',
					},
				],
				messages: [],
				result: null,
			});
		});
		test("not found responses follow Cloudflare API format", async ({
			expect,
		}) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/storage/kv/namespaces/non-existent-id/keys`
			);

			expect(response.status).toBe(404);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [{ code: 10013, message: "list keys: 'namespace not found'" }],
			});
		});
	});

	test("allows requests from local origins, blocks external", async ({
		expect,
	}) => {
		// no origin is allowed (non-browser clients)
		let res = await mf.dispatchFetch(`${BASE_URL}/storage/kv/namespaces`);
		expect(res.status).toBe(200);
		await res.arrayBuffer();

		// localhost, 127.0.0.1, [::1] all allowed
		for (const origin of [
			"http://localhost:8787",
			"http://127.0.0.1:8787",
			"http://[::1]:8787",
		]) {
			res = await mf.dispatchFetch(`${BASE_URL}/storage/kv/namespaces`, {
				headers: { Origin: origin },
			});
			expect(res.status).toBe(200);
			expect(res.headers.get("Access-Control-Allow-Origin")).toBe(origin);
			await res.arrayBuffer();
		}

		// external origin blocked
		res = await mf.dispatchFetch(`${BASE_URL}/storage/kv/namespaces`, {
			headers: { Origin: "https://evil.com" },
		});
		expect(res.status).toBe(403);
		await res.arrayBuffer();

		// malformed origin blocked
		res = await mf.dispatchFetch(`${BASE_URL}/storage/kv/namespaces`, {
			headers: { Origin: "not-a-valid-url" },
		});
		expect(res.status).toBe(403);
		await res.arrayBuffer();
	});

	test("handles CORS preflight", async ({ expect }) => {
		// allowed origin
		let res = await mf.dispatchFetch(`${BASE_URL}/storage/kv/namespaces`, {
			method: "OPTIONS",
			headers: { Origin: "http://localhost:5173" },
		});
		expect(res.status).toBe(204);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
			"http://localhost:5173"
		);
		expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
			"GET, POST, PUT, PATCH, DELETE, OPTIONS"
		);
		await res.arrayBuffer();

		// blocked origin
		res = await mf.dispatchFetch(`${BASE_URL}/storage/kv/namespaces`, {
			method: "OPTIONS",
			headers: { Origin: "https://attacker.com" },
		});
		expect(res.status).toBe(403);
		await res.arrayBuffer();
	});

	test("blocks DNS rebinding attacks via Host header", async ({ expect }) => {
		const url = await mf.ready;
		const status = await new Promise<number>((resolve, reject) => {
			const req = http.get(
				`${url.origin}${CorePaths.EXPLORER}/api/storage/kv/namespaces`,
				{ setHost: false, headers: { Host: "evil.com" } },
				(res) => {
					res.resume();
					resolve(res.statusCode ?? 0);
				}
			);
			req.on("error", reject);
		});
		expect(status).toBe(403);
	});

	test("blocks subdomains of localhost hostnames", async ({ expect }) => {
		const res = await mf.dispatchFetch(`${BASE_URL}/storage/kv/namespaces`, {
			headers: { Origin: "http://sub.localhost:8787" },
		});
		expect(res.status).toBe(403);
		await res.arrayBuffer();
	});

	describe("routing", () => {
		test("serves OpenAPI spec at /cdn-cgi/explorer/api", async ({ expect }) => {
			const res = await mf.dispatchFetch(
				"http://localhost/cdn-cgi/explorer/api"
			);
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toContain("application/json");

			const spec = await res.json();
			expect(spec).toMatchObject({
				openapi: "3.0.3",
				info: { title: "Local Explorer API" },
			});
		});

		test("serves explorer UI at /cdn-cgi/explorer", async ({ expect }) => {
			const res = await mf.dispatchFetch("http://localhost/cdn-cgi/explorer");
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toContain("text/html");

			await res.arrayBuffer(); // Drain
		});

		test("serves explorer UI at /cdn-cgi/explorer/", async ({ expect }) => {
			const res = await mf.dispatchFetch("http://localhost/cdn-cgi/explorer/");
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toContain("text/html");

			await res.arrayBuffer(); // Drain
		});

		test("does not match paths that start with /cdn-cgi/explorer but are not the explorer", async ({
			expect,
		}) => {
			// This should fall through to the user worker, not match the explorer
			const res = await mf.dispatchFetch(
				"http://localhost/cdn-cgi/explorerfoo"
			);
			expect(res.status).toBe(200);
			expect(await res.text()).toBe("user worker");
		});
	});
});

describe("Local Explorer works with custom routes", () => {
	let mf: Miniflare;

	beforeAll(async () => {
		mf = new Miniflare({
			inspectorPort: 0,
			compatibilityDate: "2025-01-01",
			modules: true,
			script: `export default { fetch() { return new Response("user worker"); } }`,
			unsafeLocalExplorer: true,
			kvNamespaces: {
				TEST_KV: "test-kv-id",
			},
			// Configure a custom route that would trigger header rewriting
			routes: ["my-custom-site.com/*"],
		});
	});

	afterAll(async () => {
		await disposeWithRetry(mf);
	});

	test("allows localhost requests even with custom routes configured", async ({
		expect,
	}) => {
		// Request from localhost should be allowed
		const res = await mf.dispatchFetch(`${BASE_URL}/storage/kv/namespaces`, {
			headers: { Origin: "http://localhost:8787" },
		});
		expect(res.status).toBe(200);
		await res.arrayBuffer();
	});

	test("blocks external origin even with custom routes configured", async ({
		expect,
	}) => {
		const res = await mf.dispatchFetch(`${BASE_URL}/storage/kv/namespaces`, {
			headers: { Origin: "https://evil.com" },
		});
		expect(res.status).toBe(403);
		await res.arrayBuffer();
	});

	test("allows configured route hostname for same-origin requests", async ({
		expect,
	}) => {
		const url = await mf.ready;
		const status = await new Promise<number>((resolve, reject) => {
			const req = http.get(
				`${url.origin}${CorePaths.EXPLORER}/api/storage/kv/namespaces`,
				{ setHost: false, headers: { Host: "my-custom-site.com" } },
				(res) => {
					res.resume();
					resolve(res.statusCode ?? 0);
				}
			);
			req.on("error", reject);
		});
		expect(status).toBe(200);
	});

	test("blocks non-configured external hostname (DNS rebinding)", async ({
		expect,
	}) => {
		const url = await mf.ready;
		const status = await new Promise<number>((resolve, reject) => {
			const req = http.get(
				`${url.origin}${CorePaths.EXPLORER}/api/storage/kv/namespaces`,
				{ setHost: false, headers: { Host: "evil.com" } },
				(res) => {
					res.resume();
					resolve(res.statusCode ?? 0);
				}
			);
			req.on("error", reject);
		});
		expect(status).toBe(403);
	});

	test("blocks cross-origin request to configured route hostname", async ({
		expect,
	}) => {
		// This simulates an attack where evil.com makes a request to the local server
		// that's listening on a configured route hostname
		const res = await mf.dispatchFetch(`${BASE_URL}/storage/kv/namespaces`, {
			headers: {
				Host: "my-custom-site.com",
				Origin: "https://evil.com",
			},
		});
		expect(res.status).toBe(403);
		await res.arrayBuffer();
	});
});

describe("Local Explorer works with wildcard routes", () => {
	let mf: Miniflare;

	beforeAll(async () => {
		mf = new Miniflare({
			inspectorPort: 0,
			compatibilityDate: "2025-01-01",
			modules: true,
			script: `export default { fetch() { return new Response("user worker"); } }`,
			unsafeLocalExplorer: true,
			kvNamespaces: {
				TEST_KV: "test-kv-id",
			},
			routes: ["*.example.com/*"],
		});
	});

	afterAll(async () => {
		await disposeWithRetry(mf);
	});

	test("allows Origin matching wildcard route base domain", async ({
		expect,
	}) => {
		let res = await mf.dispatchFetch(`${BASE_URL}/storage/kv/namespaces`, {
			headers: { Origin: "https://example.com" },
		});
		expect(res.status).toBe(200);
		await res.arrayBuffer();

		res = await mf.dispatchFetch(`${BASE_URL}/storage/kv/namespaces`, {
			headers: { Origin: "https://sub.example.com" },
		});
		expect(res.status).toBe(200);
		await res.arrayBuffer();
	});
});

describe("Local Explorer /api/local/workers endpoint", () => {
	let instanceA: Miniflare;
	let instanceB: Miniflare;
	let registryPath: string;

	beforeAll(async () => {
		registryPath = mkdtempSync(path.join(tmpdir(), "mf-registry-"));

		// Instance A has two workers
		instanceA = new Miniflare({
			inspectorPort: 0,
			compatibilityDate: "2025-01-01",
			unsafeLocalExplorer: true,
			unsafeDevRegistryPath: registryPath,
			workers: [
				{
					name: "worker-a1",
					modules: true,
					script: `
						export class TestDO {
							constructor(state) { this.state = state; }
							async fetch() { return new Response("DO"); }
						}
						export default { fetch() { return new Response("Worker A1"); } }
					`,
					kvNamespaces: {
						MY_KV: "kv-namespace-id",
					},
					d1Databases: {
						MY_DB: "d1-database-id",
					},
					r2Buckets: {
						MY_BUCKET: "r2-bucket-name",
					},
					durableObjects: {
						MY_DO: "TestDO",
					},
				},
				{
					name: "worker-a2",
					modules: true,
					script: `export default { fetch() { return new Response("Worker A2"); } }`,
					kvNamespaces: {
						KV_A2: "kv-a2",
					},
				},
			],
		});

		// Instance B has one worker
		instanceB = new Miniflare({
			name: "worker-b",
			inspectorPort: 0,
			compatibilityDate: "2025-01-01",
			modules: true,
			script: `export default { fetch() { return new Response("Worker B"); } }`,
			unsafeLocalExplorer: true,
			unsafeDevRegistryPath: registryPath,
			d1Databases: {
				DB_B: "db-b",
			},
		});

		await instanceA.ready;
		await instanceB.ready;
		await waitForWorkersInRegistry(registryPath, [
			"worker-a1",
			"worker-a2",
			"worker-b",
		]);
	});

	afterAll(async () => {
		await Promise.all([
			disposeWithRetry(instanceA),
			disposeWithRetry(instanceB),
		]);
		removeDirSync(registryPath);
	});

	test("returns all workers from multiple instances with bindings", async ({
		expect,
	}) => {
		const res = await instanceA.dispatchFetch(`${BASE_URL}/local/workers`);
		expect(res.status).toBe(200);

		const data = await res.json();
		expect(data).toEqual({
			errors: [],
			messages: [],
			result: [
				{
					bindings: {
						d1: [
							{
								bindingName: "MY_DB",
								id: "d1-database-id",
							},
						],
						do: [
							{
								bindingName: "MY_DO",
								className: "TestDO",
								id: "worker-a1-TestDO",
								scriptName: "worker-a1",
								useSqlite: false,
							},
						],
						kv: [
							{
								bindingName: "MY_KV",
								id: "kv-namespace-id",
							},
						],
						r2: [
							{
								bindingName: "MY_BUCKET",
								id: "r2-bucket-name",
							},
						],
						workflows: [],
					},
					host: "127.0.0.1",
					isSelf: true,
					name: "worker-a1",
					port: expect.any(Number),
					protocol: "http",
				},
				{
					bindings: {
						d1: [],
						do: [],
						kv: [
							{
								bindingName: "KV_A2",
								id: "kv-a2",
							},
						],
						r2: [],
						workflows: [],
					},
					host: "127.0.0.1",
					isSelf: true,
					name: "worker-a2",
					port: expect.any(Number),
					protocol: "http",
				},
				{
					bindings: {
						d1: [
							{
								bindingName: "DB_B",
								id: "db-b",
							},
						],
						do: [],
						kv: [],
						r2: [],
						workflows: [],
					},
					host: "127.0.0.1",
					isSelf: false,
					name: "worker-b",
					port: expect.any(Number),
					protocol: "http",
				},
			],
			success: true,
		});
	});
});
