import { SELF } from "cloudflare:test";
import { it } from "vitest";

it("adds numbers together", async ({ expect }) => {
	const response = await SELF.fetch("https://example.com/?a=1&b=2");
	expect(await response.text()).toBe("3");
});
