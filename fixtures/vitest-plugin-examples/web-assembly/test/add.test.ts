import { exports } from "cloudflare:workers";
import { it } from "vitest";

it("adds numbers together", async ({ expect }) => {
	const response = await exports.default.fetch("https://example.com/?a=1&b=2");
	expect(await response.text()).toBe("3");
});
