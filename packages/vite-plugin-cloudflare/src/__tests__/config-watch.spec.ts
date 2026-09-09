import { describe, test } from "vitest";
import {
	getServerWatchConfig,
	withWranglerStateIgnored,
} from "../plugins/wrangler-watch-ignore";

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

describe("getServerWatchConfig", () => {
	test("does not re-enable watching when the user set server.watch to null", ({
		expect,
	}) => {
		expect(getServerWatchConfig(null)).toBeNull();
	});

	test("ignores .wrangler when watching is enabled", ({ expect }) => {
		expect(getServerWatchConfig(undefined)).toEqual({
			ignored: "**/.wrangler/**",
		});
		expect(
			getServerWatchConfig({ usePolling: true, ignored: "**/dist/**" })
		).toEqual({
			usePolling: true,
			ignored: ["**/dist/**", "**/.wrangler/**"],
		});
	});
});
