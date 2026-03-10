import { it } from "vitest";

it("replaces defines from wrangler.toml", async ({ expect }) => {
	expect(WRANGLER_DEFINED_THING).toBe("thing");
	expect(WRANGLER_NESTED.DEFINED.THING).toStrictEqual([1, 2, 3]);
	expect(WRANGLER_NESTED.DEFINED.THING).toBe(WRANGLER_NESTED.DEFINED.THING);
});

it("replaces defines from vitest.config.mts", async ({ expect }) => {
	expect(CONFIG_DEFINED_THING).toBe("thing");
	expect(CONFIG_NESTED.DEFINED.THING).toStrictEqual([1, 2, 3]);
	expect(CONFIG_NESTED.DEFINED.THING).toBe(CONFIG_NESTED.DEFINED.THING);
});
