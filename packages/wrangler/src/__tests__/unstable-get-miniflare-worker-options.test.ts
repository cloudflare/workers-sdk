import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { unstable_getMiniflareWorkerOptions } from "../api";
import { runInTempDir } from "./helpers/run-in-tmp";

describe("unstable_getMiniflareWorkerOptions", () => {
	runInTempDir();

	describe("zone derivation (used for the outbound CF-Worker header)", () => {
		it("uses dev.host when it is set", ({ expect }) => {
			writeWranglerConfig(
				{
					name: "test-worker",
					main: "./index.js",
					compatibility_date: "2024-10-04",
					dev: {
						host: "repro.example.workers.dev",
					},
				},
				"./wrangler.json"
			);
			const { workerOptions } =
				unstable_getMiniflareWorkerOptions("./wrangler.json");
			expect(workerOptions.zone).toBe("repro.example.workers.dev");
		});

		it("derives the zone from a single `route` string when dev.host is not set", ({
			expect,
		}) => {
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

		it("derives the zone from the first entry in `routes` when dev.host is not set", ({
			expect,
		}) => {
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

		it("prefers dev.host over routes when both are set", ({ expect }) => {
			writeWranglerConfig(
				{
					name: "test-worker",
					main: "./index.js",
					compatibility_date: "2024-10-04",
					dev: {
						host: "preferred.example.com",
					},
					routes: ["https://other.example.com/*"],
				},
				"./wrangler.json"
			);
			const { workerOptions } =
				unstable_getMiniflareWorkerOptions("./wrangler.json");
			expect(workerOptions.zone).toBe("preferred.example.com");
		});

		it("returns undefined when neither dev.host nor routes are configured", ({
			expect,
		}) => {
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
