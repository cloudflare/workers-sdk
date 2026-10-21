import { describe, test } from "vitest";
import {
	getServerWatchConfig,
	withCloudflareStateIgnored,
} from "../plugins/cloudflare-watch-ignore";

describe("withCloudflareStateIgnored", () => {
	test("ignores .cloudflare when the user has no watch.ignored", ({
		expect,
	}) => {
		expect(withCloudflareStateIgnored(undefined)).toBe("**/.cloudflare/**");
	});

	test("appends .cloudflare to existing ignore patterns", ({ expect }) => {
		expect(withCloudflareStateIgnored("**/dist/**")).toEqual([
			"**/dist/**",
			"**/.cloudflare/**",
		]);
		expect(withCloudflareStateIgnored(["**/node_modules/**"])).toEqual([
			"**/node_modules/**",
			"**/.cloudflare/**",
		]);
	});
});

describe("getServerWatchConfig", () => {
	test("ignores the complete framework directory while preserving user patterns and disabled watching", ({
		expect,
	}) => {
		expect(
			getServerWatchConfig(
				{ ignored: "**/dist/**" },
				"/project/.void/cloudflare"
			)
		).toEqual({
			ignored: [
				"**/dist/**",
				"**/.cloudflare/**",
				"/project/.void/cloudflare",
				"/project/.void/cloudflare/**",
			],
		});
		expect(getServerWatchConfig(null, "/project/.void/cloudflare")).toBeNull();
	});

	test("does not re-enable watching when the user set server.watch to null", ({
		expect,
	}) => {
		expect(getServerWatchConfig(null)).toBeNull();
	});

	test("ignores .cloudflare when watching is enabled", ({ expect }) => {
		expect(getServerWatchConfig(undefined)).toEqual({
			ignored: "**/.cloudflare/**",
		});
		expect(
			getServerWatchConfig({ usePolling: true, ignored: "**/dist/**" })
		).toEqual({
			usePolling: true,
			ignored: ["**/dist/**", "**/.cloudflare/**"],
		});
	});
});
