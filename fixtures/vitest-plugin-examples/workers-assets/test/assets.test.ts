import { env, exports, withEnv } from "cloudflare:workers";
import { describe, it } from "vitest";
import worker from "../src";

describe("Hello World user worker", () => {
	it('responds with "Hello, World!" (integration style)', async ({
		expect,
	}) => {
		const response = await exports.default.fetch("http://example.com/message");
		expect(await response.text()).toMatchInlineSnapshot(`"Hello, World!"`);
	});

	it("returns 404 for unknown routes (assets are not routed through exports.default)", async ({
		expect,
	}) => {
		const response = await exports.default.fetch("http://example.com/");
		expect(response.status).toBe(404);
	});

	it("can mock the ASSETS binding using withEnv", async ({ expect }) => {
		const mockAssets = {
			fetch: async () => new Response("mocked asset response"),
		};

		await withEnv({ ...env, ASSETS: mockAssets }, async () => {
			const response = await worker.fetch(
				new Request("http://example.com/binding"),
				env,
				{} as ExecutionContext
			);
			expect(await response.text()).toBe("mocked asset response");
		});
	});
});
