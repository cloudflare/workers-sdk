import { describe, test } from "vitest";
import { withWranglerStateIgnored } from "../plugins/wrangler-watch-ignore";

describe("withWranglerStateIgnored", () => {
	test("ignores .wrangler when the user has no watch.ignored", ({ expect }) => {
		expect(withWranglerStateIgnored(undefined)).toBe("**/.wrangler/**");
	});

	test("appends .wrangler to existing ignore patterns", ({ expect }) => {
		expect(withWranglerStateIgnored("**/dist/**")).toEqual([
			"**/dist/**",
			"**/.wrangler/**",
		]);
		expect(withWranglerStateIgnored(["**/node_modules/**"])).toEqual([
			"**/node_modules/**",
			"**/.wrangler/**",
		]);
	});
});
