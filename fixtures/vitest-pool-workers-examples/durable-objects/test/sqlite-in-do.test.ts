import { SELF } from "cloudflare:test";
import { expect, it } from "vitest";

it("enables SQL API with migrations", async () => {
	const response = await SELF.fetch("https://example.com/sql");
	expect(await response.text()).toBe("4096");
});
