import { SELF } from "cloudflare:test";
import { it } from "vitest";

it("reads assets from the configured directory", async ({ expect }) => {
	expect(
		await (await SELF.fetch("http://example.com/test.txt")).text()
	).toMatchInlineSnapshot(`"Hello, World!"`);
});
