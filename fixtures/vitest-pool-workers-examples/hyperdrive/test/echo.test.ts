import { SELF } from "cloudflare:test";
import { it } from "vitest";

it("responds with request body", async ({ expect }) => {
	const response = await SELF.fetch("https://example.com/", {
		method: "POST",
		body: "body",
	});
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("body");
});
