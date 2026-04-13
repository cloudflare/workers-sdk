import { resolve } from "path";
import { CorePaths } from "miniflare";
import { afterAll, assert, beforeAll, describe, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

const EXPLORER_API_PATH = `${CorePaths.EXPLORER}/api`;

describe("local explorer", () => {
	let ip: string;
	let port: number;
	let stop: (() => Promise<unknown>) | undefined;

	beforeAll(async () => {
		({ ip, port, stop } = await runWranglerDev(resolve(__dirname, ".."), [
			"--port=0",
			"--inspector-port=0",
		]));
	});

	afterAll(async () => {
		await stop?.();
	});

	it(`returns local explorer API response for ${EXPLORER_API_PATH}`, async ({
		expect,
	}) => {
		const response = await fetch(
			`http://${ip}:${port}${EXPLORER_API_PATH}/storage/kv/namespaces`
		);
		expect(response.headers.get("Content-Type")).toBe("application/json");
		const json = await response.json();
		expect(json).toMatchObject({
			errors: [],
			messages: [],
			result: [
				{
					id: "KV",
					title: "KV",
				},
				{
					id: "some-kv-id",
					title: "KV_WITH_ID",
				},
				{
					id: "worker-b-kv-id",
					title: "KV_B",
				},
			],
			result_info: {
				count: 3,
			},
			success: true,
		});
	});

	it("returns worker response for normal requests", async ({ expect }) => {
		const response = await fetch(`http://${ip}:${port}/`);
		const text = await response.text();
		expect(text).toBe("Hello World!");
	});

	it("bulk/get succeeds when combined value size exceeds 25 MB", async ({
		expect,
	}) => {
		// Regression test for https://github.com/cloudflare/workers-sdk/issues/13459
		// Seed 3 × 10 MB values (30 MB total) which exceeds the KV bulk-get
		// aggregate limit of 25 MB.
		const seedResponse = await fetch(
			`http://${ip}:${port}/kv/seed-large?count=3&sizeMB=10`
		);
		expect(seedResponse.ok).toBe(true);

		// Now hit the explorer bulk/get endpoint for those keys
		const bulkResponse = await fetch(
			`http://${ip}:${port}${EXPLORER_API_PATH}/storage/kv/namespaces/KV/bulk/get`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					keys: ["large-value-0", "large-value-1", "large-value-2"],
				}),
			}
		);

		expect(bulkResponse.status).toBe(200);
		const json = (await bulkResponse.json()) as {
			success: boolean;
			result: { values: Record<string, string | null> };
		};
		expect(json.success).toBe(true);
		expect(Object.keys(json.result.values)).toHaveLength(3);
		// Each value should be 10 MB (10 * 1024 * 1024 chars)
		for (const key of ["large-value-0", "large-value-1", "large-value-2"]) {
			const value = json.result.values[key];
			expect(value).not.toBeNull();
			expect(value?.length).toBe(10 * 1024 * 1024);
		}
	});

	it(`serves UI index.html at ${CorePaths.EXPLORER}`, async ({ expect }) => {
		const response = await fetch(`http://${ip}:${port}${CorePaths.EXPLORER}`);
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(
			"text/html; charset=utf-8"
		);
		const text = await response.text();
		expect(text).toContain("<!doctype html>");
		expect(text).toContain("Cloudflare Local Explorer");
	});

	it(`serves UI assets at ${CorePaths.EXPLORER}/assets/*`, async ({
		expect,
	}) => {
		// First get index.html to find the actual asset paths
		const indexResponse = await fetch(
			`http://${ip}:${port}${CorePaths.EXPLORER}`
		);
		const html = await indexResponse.text();

		// Extract JS asset path from the HTML
		// The HTML looks like: <script type="module" crossorigin src="/cdn-cgi/explorer/assets/index-xxx.js">
		const jsMatch = html.match(/assets\/index-[^"]+\.js/);
		assert(jsMatch, "Expected JS asset path in HTML");
		const jsPath = jsMatch[0];

		// Fetch the JS asset
		const jsResponse = await fetch(
			`http://${ip}:${port}${CorePaths.EXPLORER}/${jsPath}`
		);
		expect(jsResponse.status).toBe(200);
		expect(jsResponse.headers.get("Content-Type")).toMatch(
			/^application\/javascript/
		);
	});

	it("serves UI with SPA fallback for unknown routes", async ({ expect }) => {
		// Request a route that doesn't exist as a file but should be handled by the SPA
		const response = await fetch(
			`http://${ip}:${port}${CorePaths.EXPLORER}/kv/some-namespace`
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(
			"text/html; charset=utf-8"
		);
		const text = await response.text();
		expect(text).toContain("<!doctype html>");
	});

	describe("with X_LOCAL_EXPLORER=false", () => {
		let ip: string;
		let port: number;
		let stop: (() => Promise<unknown>) | undefined;

		beforeAll(async () => {
			({ ip, port, stop } = await runWranglerDev(
				resolve(__dirname, ".."),
				["--port=0", "--inspector-port=0"],
				{ X_LOCAL_EXPLORER: "false" }
			));
		});

		afterAll(async () => {
			await stop?.();
		});

		it(`returns worker response for ${EXPLORER_API_PATH}`, async ({
			expect,
		}) => {
			const response = await fetch(`http://${ip}:${port}${EXPLORER_API_PATH}`);
			const text = await response.text();
			expect(text).toBe("Hello World!");
		});

		it("returns worker response for normal requests", async ({ expect }) => {
			const response = await fetch(`http://${ip}:${port}/`);
			const text = await response.text();
			expect(text).toBe("Hello World!");
		});
	});

	// These tests verify that the local explorer API remains accessible when
	// various host/routing options are configured. The security check for the
	// explorer API must happen before header rewriting to work correctly.
	describe.each([
		{ name: "--route", flag: "--route=my-custom-site.com/*" },
		{
			name: "--local-upstream",
			flag: "--local-upstream=my-upstream.example.com",
		},
		{ name: "--host", flag: "--host=my-host.example.com" },
	])("with $name configured", ({ flag }) => {
		let ip: string;
		let port: number;
		let stop: (() => Promise<unknown>) | undefined;

		beforeAll(async () => {
			({ ip, port, stop } = await runWranglerDev(
				resolve(__dirname, ".."),
				["--port=0", "--inspector-port=0", flag],
				{ X_LOCAL_EXPLORER: "true" }
			));
		});

		afterAll(async () => {
			await stop?.();
		});

		it("local explorer API is still accessible via localhost", async ({
			expect,
		}) => {
			const response = await fetch(
				`http://${ip}:${port}${EXPLORER_API_PATH}/storage/kv/namespaces`
			);
			expect(response.status).toBe(200);
			expect(response.headers.get("Content-Type")).toBe("application/json");
			const json = (await response.json()) as { success: boolean };
			expect(json.success).toBe(true);
		});

		it(`serves explorer UI`, async ({ expect }) => {
			const response = await fetch(`http://${ip}:${port}${CorePaths.EXPLORER}`);
			expect(response.status).toBe(200);
			expect(response.headers.get("Content-Type")).toBe(
				"text/html; charset=utf-8"
			);
			const text = await response.text();
			expect(text).toContain("<!doctype html>");
			expect(text).toContain("Cloudflare Local Explorer");
		});

		it("worker still responds to normal requests", async ({ expect }) => {
			const response = await fetch(`http://${ip}:${port}/`);
			const text = await response.text();
			expect(text).toBe("Hello World!");
		});
	});
});
