import { describe, test } from "vitest";
import { resolveCompatibilityFlags } from "../../utils/compatibility-flags";

describe("resolveCompatibilityFlags", () => {
	test("it does not interfere with existing flags", ({ expect }) => {
		expect(resolveCompatibilityFlags({ compatibilityFlags: ["foo", "bar"] }))
			.toMatchInlineSnapshot(`
			[
			  "foo",
			  "bar",
			]
		`);
	});

	test("it opts you into new flags if you have a future date", ({ expect }) => {
		const compatibilityFlags = resolveCompatibilityFlags({
			compatibilityFlags: ["foo", "bar"],
			compatibilityDate: "2099-12-12",
		});

		expect(compatibilityFlags).toContain("foo");
		expect(compatibilityFlags).toContain("bar");
		expect(compatibilityFlags).toContain(
			"assets_navigation_prefers_asset_serving"
		);
	});

	test("it doesn't double you up if you've already opted into new flags and have a future date", ({
		expect,
	}) => {
		const compatibilityFlags = resolveCompatibilityFlags({
			compatibilityFlags: [
				"foo",
				"bar",
				"assets_navigation_prefers_asset_serving",
			],
			compatibilityDate: "2099-12-12",
		});

		expect(compatibilityFlags).toContain("foo");
		expect(compatibilityFlags).toContain("bar");
		expect(
			compatibilityFlags.filter(
				(flag) => flag === "assets_navigation_prefers_asset_serving"
			).length
		).toBe(1);
	});

	test("it doesn't opt you into new flags if you have a future date and have disabled it", ({
		expect,
	}) => {
		const compatibilityFlags = resolveCompatibilityFlags({
			compatibilityFlags: ["foo", "bar", "assets_navigation_has_no_effect"],
			compatibilityDate: "2099-12-12",
		});

		expect(compatibilityFlags).toContain("foo");
		expect(compatibilityFlags).toContain("bar");
		expect(compatibilityFlags).not.toContain(
			"assets_navigation_prefers_asset_serving"
		);
	});

	test("it does not mutate the passed-in flags array", ({ expect }) => {
		const input = ["foo"];
		resolveCompatibilityFlags({
			compatibilityFlags: input,
			compatibilityDate: "2099-12-12",
		});

		expect(input).toEqual(["foo"]);
	});
});
