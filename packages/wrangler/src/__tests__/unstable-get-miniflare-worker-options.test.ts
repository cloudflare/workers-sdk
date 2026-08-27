import {
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { unstable_getMiniflareWorkerOptions } from "../api";

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

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
			expect(workerOptions.zone).toBe("example.com");
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
			expect(workerOptions.zone).toBe("foo.example.com");
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
					routes: [{ pattern: "foo.example.com/*", zone_name: "example.com" }],
				},
				"./wrangler.json"
			);
			const { workerOptions } =
				unstable_getMiniflareWorkerOptions("./wrangler.json");
			expect(workerOptions.zone).toBe("example.com");
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

	describe("Cloudflare Access local dev simulation (`ctx.access`)", () => {
		it("passes `access.dev` through to the Miniflare worker options", ({
			expect,
		}) => {
			writeWranglerConfig(
				{
					name: "test-worker",
					main: "./index.js",
					compatibility_date: "2024-10-04",
					access: {
						dev: {
							aud: "my-app-aud-tag",
							identity: {
								email: "user@example.com",
								name: "Test User",
							},
						},
					},
				},
				"./wrangler.json"
			);
			const { workerOptions } =
				unstable_getMiniflareWorkerOptions("./wrangler.json");
			// Without this, `ctx.access` resolves to `undefined` under
			// @cloudflare/vitest-plugin even though `wrangler dev` honours it.
			expect(workerOptions.access).toEqual({
				aud: "my-app-aud-tag",
				identity: {
					email: "user@example.com",
					name: "Test User",
				},
			});
		});

		it("leaves `access` undefined when no `access` config is present", ({
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
			expect(workerOptions.access).toBeUndefined();
		});
	});

	describe("workflow bindings", () => {
		it("drops deploy-only workflow fields that the local runtime has no concept of", ({
			expect,
		}) => {
			writeWranglerConfig(
				{
					name: "test-worker",
					main: "./index.js",
					compatibility_date: "2024-10-04",
					workflows: [
						{
							binding: "WORKFLOW",
							name: "my-workflow",
							class_name: "MyWorkflow",
							limits: { steps: 5000 },
							schedules: "0 * * * *",
							default_retention: {
								success_retention: "3 days",
								error_retention: 86400000,
							},
						},
					],
				},
				"./wrangler.json"
			);

			const { workerOptions } =
				unstable_getMiniflareWorkerOptions("./wrangler.json");

			expect(workerOptions.workflows).toEqual({
				WORKFLOW: {
					name: "my-workflow",
					className: "MyWorkflow",
					scriptName: undefined,
					stepLimit: 5000,
				},
			});
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

			expect(
				asRecord(workerOptions.serviceBindings)?.ENTITLEMENTS
			).toBeUndefined();
			expect(workerOptions.unsafeBindings).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						name: "ENTITLEMENTS",
						type: "service",
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
					}),
				])
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
			expect(asRecord(workerOptions.serviceBindings)?.MY_SERVICE).toBeDefined();
			expect(
				asArray(workerOptions.unsafeBindings).find(
					(b) => asRecord(b)?.name === "MY_SERVICE"
				)
			).toBeUndefined();
		});
	});
});
