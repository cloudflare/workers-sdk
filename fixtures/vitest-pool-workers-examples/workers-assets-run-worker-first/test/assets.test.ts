import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("Hello World user worker", () => {
	describe("integration test style", async () => {
		it('responds with "Hello, World!" (integration style)', async () => {
			const response = await SELF.fetch("http://example.com/message");
			expect(await response.text()).toMatchInlineSnapshot(`"Hello, World!"`);

			expect(response.headers.get("x-test")).toEqual("hello");
		});
		it("does NOT get assets directly, but always hits the user Worker", async () => {
			// asset at /index.html
			const response = await SELF.fetch("http://example.com/index.html");
			expect(await response.text()).toContain("Hello, World!");
			expect(response.headers.get("x-test")).toEqual("hello");
		});
		it("can still get assets via binding", async () => {
			const response = await SELF.fetch("http://example.com/binding");
			expect(await response.text()).toContain("binding.html");
		});
	});
});
