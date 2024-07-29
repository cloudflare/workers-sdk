import { SELF } from "cloudflare:test";
import { expect, it } from "vitest";

it("adds numbers together", async () => {
	const response = await SELF.fetch("https://example.com/?a=1&b=2");
	expect(await response.text()).toBe("3");
});
