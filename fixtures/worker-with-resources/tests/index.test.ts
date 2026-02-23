import { resolve } from "path";
import { LOCAL_EXPLORER_API_PATH, LOCAL_EXPLORER_BASE_PATH } from "miniflare";
import { afterAll, assert, beforeAll, describe, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("local explorer", () => {
	describe("with X_LOCAL_EXPLORER=true", () => {
		let ip: string;
		let port: number;
		let stop: (() => Promise<unknown>) | undefined;

		beforeAll(async () => {
			({ ip, port, stop } = await runWranglerDev(
				resolve(__dirname, ".."),
				["--port=0", "--inspector-port=0"],
				{ X_LOCAL_EXPLORER: "true" }
			));
		});

		afterAll(async () => {
			await stop?.();
		});

		it(`returns local explorer API response for ${LOCAL_EXPLORER_API_PATH}`, async ({
			expect,
		}) => {
			const response = await fetch(
				`http://${ip}:${port}${LOCAL_EXPLORER_API_PATH}/storage/kv/namespaces`
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
				],
				result_info: {
					count: 2,
					page: 1,
					per_page: 20,
					total_count: 2,
				},
				success: true,
			});
		});

		it("returns worker response for normal requests", async ({ expect }) => {
			const response = await fetch(`http://${ip}:${port}/`);
			const text = await response.text();
			expect(text).toBe("Hello World!");
		});

		it(`serves UI index.html at ${LOCAL_EXPLORER_BASE_PATH}`, async ({
			expect,
		}) => {
			const response = await fetch(
				`http://${ip}:${port}${LOCAL_EXPLORER_BASE_PATH}`
			);
			expect(response.status).toBe(200);
			expect(response.headers.get("Content-Type")).toBe(
				"text/html; charset=utf-8"
			);
			const text = await response.text();
			expect(text).toContain("<!doctype html>");
			expect(text).toContain("Cloudflare Local Explorer");
		});

		it(`serves UI assets at ${LOCAL_EXPLORER_BASE_PATH}/assets/*`, async ({
			expect,
		}) => {
			// First get index.html to find the actual asset paths
			const indexResponse = await fetch(
				`http://${ip}:${port}${LOCAL_EXPLORER_BASE_PATH}`
			);
			const html = await indexResponse.text();

			// Extract JS asset path from the HTML
			// The HTML looks like: <script type="module" crossorigin src="/cdn-cgi/explorer/assets/index-xxx.js">
			const jsMatch = html.match(/assets\/index-[^"]+\.js/);
			assert(jsMatch, "Expected JS asset path in HTML");
			const jsPath = jsMatch[0];

			// Fetch the JS asset
			const jsResponse = await fetch(
				`http://${ip}:${port}${LOCAL_EXPLORER_BASE_PATH}/${jsPath}`
			);
			expect(jsResponse.status).toBe(200);
			expect(jsResponse.headers.get("Content-Type")).toMatch(
				/^application\/javascript/
			);
		});

		it("serves UI with SPA fallback for unknown routes", async ({ expect }) => {
			// Request a route that doesn't exist as a file but should be handled by the SPA
			const response = await fetch(
				`http://${ip}:${port}${LOCAL_EXPLORER_BASE_PATH}/kv/some-namespace`
			);
			expect(response.status).toBe(200);
			expect(response.headers.get("Content-Type")).toBe(
				"text/html; charset=utf-8"
			);
			const text = await response.text();
			expect(text).toContain("<!doctype html>");
		});
	});

	describe("without X_LOCAL_EXPLORER (default)", () => {
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

		it("returns worker response for LOCAL_EXPLORER_API_PATH", async ({
			expect,
		}) => {
			const response = await fetch(
				`http://${ip}:${port}${LOCAL_EXPLORER_API_PATH}`
			);
			const text = await response.text();
			expect(text).toBe("Hello World!");
		});

		it("returns worker response for normal requests", async ({ expect }) => {
			const response = await fetch(`http://${ip}:${port}/`);
			const text = await response.text();
			expect(text).toBe("Hello World!");
		});
	});
});
