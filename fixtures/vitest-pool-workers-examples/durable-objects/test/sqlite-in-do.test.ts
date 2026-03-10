import { SELF } from "cloudflare:test";
import { it } from "vitest";

it("enables SQL API with migrations", async ({ expect }) => {
	const response = await SELF.fetch("https://example.com/sql");
	expect(await response.text()).toBe("4096");
});
