import {
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { unstable_getMiniflareWorkerOptions } from "../api";

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
			expect(workerOptions.dev?.zone).toBe("example.com");
		});

		it("uses the first entry in `routes`, preferring its `zone_name`", ({
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
			// Per https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-worker
			// the `CF-Worker` header is the zone name that owns the Worker, not
			// the route pattern's hostname.
			expect(workerOptions.dev?.zone).toBe("example.com");
		});

		it("falls back to the pattern hostname when `zone_name` is absent", ({
			expect,
		}) => {
			writeWranglerConfig(
				{
					name: "test-worker",
					main: "./index.js",
					compatibility_date: "2024-10-04",
					routes: [{ pattern: "foo.example.com/*", zone_id: "abc123" }],
				},
				"./wrangler.json"
			);
			const { workerOptions } =
				unstable_getMiniflareWorkerOptions("./wrangler.json");
			// Without `zone_name` or an account-scoped API lookup we can't
			// determine the parent zone locally, so the pattern hostname is
			// the closest approximation.
			expect(workerOptions.dev?.zone).toBe("foo.example.com");
		});

		it("uses `zone_name` for unparseable patterns like `*/*`", ({ expect }) => {
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
			expect(workerOptions.dev?.zone).toBe("example.com");
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
			expect(workerOptions.dev?.zone).toBeUndefined();
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
					routes: [{ pattern: "foo.example.com/*", zone_name: "example.com" }],
				},
				"./wrangler.json"
			);
			const { workerOptions } =
				unstable_getMiniflareWorkerOptions("./wrangler.json");
			expect(workerOptions.dev?.zone).toBe("example.com");
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
			expect(workerOptions.dev?.zone).toBeUndefined();
		});
	});

	describe("typed services bindings with `dev.plugin`", () => {
		it("routes a typed service binding with `dev.plugin` to miniflare's unsafe-binding plugin pathway", ({
			expect,
		}) => {
			writeWranglerConfig(
				{
					name: "test-worker",
					main: "./index.js",
					compatibility_date: "2024-10-04",
					services: [
						{
							binding: "ENTITLEMENTS",
							service: "edge-entitlements",
							entrypoint: "EntitlementsRPCService",
							// @ts-expect-error - cross_account_grant is internal-only and not in the public config types
							cross_account_grant: "entitlements-grant",
							dev: {
								plugin: {
									package: "@cloudflare/workers-toolbox-plugins",
									name: "entitlements",
								},
								options: {
									entitlements: [
										{
											key: "containers.enabled",
											targets: ["account"],
											type: "bool",
										},
									],
									mapping: { "*": { "containers.enabled": true } },
								},
							},
						},
					],
				},
				"./wrangler.json"
			);
			const { workerOptions } =
				unstable_getMiniflareWorkerOptions("./wrangler.json");

			expect(workerOptions.config.env?.ENTITLEMENTS).toEqual(
				expect.objectContaining({
					type: "unsafe:service",
					dev: {
						plugin: {
							package: "@cloudflare/workers-toolbox-plugins",
							name: "entitlements",
						},
						options: expect.objectContaining({
							service: "edge-entitlements",
							entrypoint: "EntitlementsRPCService",
							cross_account_grant: "entitlements-grant",
							entitlements: [
								{
									key: "containers.enabled",
									targets: ["account"],
									type: "bool",
								},
							],
							mapping: { "*": { "containers.enabled": true } },
						}),
					},
				})
			);
		});

		it("leaves a typed service binding without `dev` on the regular service-binding pathway", ({
			expect,
		}) => {
			writeWranglerConfig(
				{
					name: "test-worker",
					main: "./index.js",
					compatibility_date: "2024-10-04",
					services: [
						{
							binding: "MY_SERVICE",
							service: "real-service",
						},
					],
				},
				"./wrangler.json"
			);
			const { workerOptions } =
				unstable_getMiniflareWorkerOptions("./wrangler.json");
			expect(workerOptions.config.env?.MY_SERVICE).toEqual(
				expect.objectContaining({
					type: "worker",
					workerName: "real-service",
				})
			);
		});
	});
});
