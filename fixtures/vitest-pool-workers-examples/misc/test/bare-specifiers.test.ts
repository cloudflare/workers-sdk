// Regression test for #6214: bare Node.js module specifiers (without `node:`
// prefix) should resolve. The `module-fallback.ts` `viteResolve()` codepath
// prepends `node:` when a bare specifier isn't found in workerd built-ins.
import { describe, it } from "vitest";

describe("bare Node module specifiers", () => {
	it("resolves 'url' without node: prefix", async ({ expect }) => {
		const urlModule = await import("url");
		expect(urlModule.URL).toBeDefined();
		expect(new urlModule.URL("https://example.com").hostname).toBe(
			"example.com"
		);
	});

	it("resolves 'path' without node: prefix", async ({ expect }) => {
		const pathModule = await import("path");
		expect(pathModule.join).toBeDefined();
		expect(pathModule.join("/foo", "bar")).toBe("/foo/bar");
	});

	it("resolves 'buffer' without node: prefix", async ({ expect }) => {
		const bufferModule = await import("buffer");
		expect(bufferModule.Buffer).toBeDefined();
		expect(bufferModule.Buffer.from("hello").toString()).toBe("hello");
	});
});
