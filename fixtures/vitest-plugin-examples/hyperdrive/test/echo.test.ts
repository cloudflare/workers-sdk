import { exports } from "cloudflare:workers";
import { it } from "vitest";

it("responds with request body", async ({ expect }) => {
	const response = await exports.default.fetch("https://example.com/", {
		method: "POST",
		body: "body",
	});
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("body");
});
