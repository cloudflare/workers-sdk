import { exports } from "cloudflare:workers";
import { it } from "vitest";

it("runs Worker code when Containers are disabled", async ({ expect }) => {
	const response = await exports.default.fetch("http://example.com/");
	expect(await response.text()).toBe("Worker is ready");
});
