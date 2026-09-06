import { exports } from "cloudflare:workers";
import { it } from "vitest";

it("stores in KV namespace", async ({ expect }) => {
	let response = await exports.default.fetch("https://example.com/kv/key", {
		method: "PUT",
		body: "value",
	});
	expect(response.status).toBe(204);

	response = await exports.default.fetch("https://example.com/kv/key");
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("value");
});
