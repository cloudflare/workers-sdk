import { SELF } from "cloudflare:test";
import { it } from "vitest";

it("runs in Node.js compatibility mode", ({ expect }) => {
	expect(typeof process).toBe("object");
	expect(process.versions).toBeDefined();
	expect(process.versions.node).toBeDefined();
	expect(typeof Buffer).toBe("function");
});

it("dispatches to an HTTP server registered with `cloudflare:node`", async ({
	expect,
}) => {
	const response = await SELF.fetch("https://example.com");

	expect(await response.text()).toBe("Hello from an httpServerHandler");
});
