import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { unstable_getMiniflareWorkerOptions } from "../api";
import { runInTempDir } from "./helpers/run-in-tmp";

describe("unstable_getMiniflareWorkerOptions", () => {
	runInTempDir();

	describe("zone derivation (used for the outbound CF-Worker header)", () => {
		it("derives the zone from a single `route` string", ({ expect }) => {
			writeWranglerConfig(
				{
					name: "test-worker",
					main: "./index.js",
					compatibility_date: "2024-10-04",
					route: "https://example.com/api/*",
				},
				"./wrangler.json"
			);
			const { workerOptions } =
				unstable_getMiniflareWorkerOptions("./wrangler.json");
			expect(workerOptions.zone).toBe("example.com");
		});

		it("derives the zone from the first entry in `routes`", ({ expect }) => {
			writeWranglerConfig(
				{
					name: "test-worker",
					main: "./index.js",
					compatibility_date: "2024-10-04",
					routes: [
						{ pattern: "foo.example.com/*", zone_name: "example.com" },
						"bar.example.com/*",
					],
				},
				"./wrangler.json"
			);
			const { workerOptions } =
				unstable_getMiniflareWorkerOptions("./wrangler.json");
			expect(workerOptions.zone).toBe("foo.example.com");
		});

		it("falls back to `zone_name` for unparseable patterns like `*/*`", ({
			expect,
		}) => {
			writeWranglerConfig(
				{
					name: "test-worker",
					main: "./index.js",
					compatibility_date: "2024-10-04",
					routes: [{ pattern: "*/*", zone_name: "example.com" }],
				},
				"./wrangler.json"
			);
			const { workerOptions } =
				unstable_getMiniflareWorkerOptions("./wrangler.json");
			expect(workerOptions.zone).toBe("example.com");
		});

		it("ignores `dev.host` (the `dev` config block is `wrangler dev`-only)", ({
			expect,
		}) => {
			writeWranglerConfig(
				{
					name: "test-worker",
					main: "./index.js",
					compatibility_date: "2024-10-04",
					dev: {
						host: "ignored.example.com",
					},
				},
				"./wrangler.json"
			);
			const { workerOptions } =
				unstable_getMiniflareWorkerOptions("./wrangler.json");
			expect(workerOptions.zone).toBeUndefined();
		});

		it("derives the zone from `routes` even when `dev.host` is also set", ({
			expect,
		}) => {
			writeWranglerConfig(
				{
					name: "test-worker",
					main: "./index.js",
					compatibility_date: "2024-10-04",
					dev: {
						host: "ignored.example.com",
					},
					routes: ["https://other.example.com/*"],
				},
				"./wrangler.json"
			);
			const { workerOptions } =
				unstable_getMiniflareWorkerOptions("./wrangler.json");
			expect(workerOptions.zone).toBe("other.example.com");
		});

		it("returns undefined when no routes are configured", ({ expect }) => {
			writeWranglerConfig(
				{
					name: "test-worker",
					main: "./index.js",
					compatibility_date: "2024-10-04",
				},
				"./wrangler.json"
			);
			const { workerOptions } =
				unstable_getMiniflareWorkerOptions("./wrangler.json");
			expect(workerOptions.zone).toBeUndefined();
		});
	});
});
