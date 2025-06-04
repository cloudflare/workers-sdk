import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// There is no Worker so we can't import one and unit test
it("can test asset serving (integration style)", async () => {
	let response = await SELF.fetch("http://example.com/index.html");
	expect(await response.text()).toContain("Asset index.html");

	// no such asset
	response = await SELF.fetch("http://example.com/message");
	expect(await response.text()).toBeFalsy();
	expect(response.status).toBe(404);
});
