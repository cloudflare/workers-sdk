import { SELF } from "cloudflare:test";
import { it } from "vitest";

it("stores in KV namespace", async ({ expect }) => {
	let response = await SELF.fetch("https://example.com/kv/key", {
		method: "PUT",
		body: "value",
	});
	expect(response.status).toBe(204);

	response = await SELF.fetch("https://example.com/kv/key");
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("value");
});
