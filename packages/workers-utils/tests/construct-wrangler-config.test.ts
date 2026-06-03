import { describe, it } from "vitest";
import { constructWranglerConfig } from "../src/construct-wrangler-config";

type APIWorkerConfig = Parameters<typeof constructWranglerConfig>[0];

/**
 * Factory for a minimal valid APIWorkerConfig.
 * Tests override only the fields they care about.
 *
 * @param overrides - Partial fields to merge into the default config
 * @returns A complete APIWorkerConfig with sensible defaults
 */
function makeWorkerConfig(
	overrides: Partial<APIWorkerConfig> = {}
): APIWorkerConfig {
	return {
		name: "my-worker",
		entrypoint: "index.js",
		tags: [],
		compatibility_date: "2025-01-01",
		compatibility_flags: [],
		logpush: undefined,
		routes: [],
		tail_consumers: undefined,
		domains: [],
		schedules: [],
		bindings: [],
		observability: undefined,
		limits: undefined,
		placement: undefined,
		subdomain: { enabled: true, previews_enabled: false },
		...overrides,
	};
}

describe("constructWranglerConfig", () => {
	describe("basic field mapping", () => {
		it("maps core fields correctly", ({ expect }) => {
			const config = makeWorkerConfig({
				name: "test-worker",
				entrypoint: "src/main.ts",
				compatibility_date: "2025-03-15",
				compatibility_flags: ["nodejs_compat", "url_standard"],
				subdomain: { enabled: true, previews_enabled: true },
			});
			const result = constructWranglerConfig(config);

			expect(result.name).toBe("test-worker");
			expect(result.main).toBe("src/main.ts");
			expect(result.workers_dev).toBe(true);
			expect(result.preview_urls).toBe(true);
			expect(result.compatibility_date).toBe("2025-03-15");
			expect(result.compatibility_flags).toEqual([
				"nodejs_compat",
				"url_standard",
			]);
		});

		it("maps workers_dev and preview_urls from subdomain", ({ expect }) => {
			const config = makeWorkerConfig({
				subdomain: { enabled: false, previews_enabled: true },
			});
			const result = constructWranglerConfig(config);

			expect(result.workers_dev).toBe(false);
			expect(result.preview_urls).toBe(true);
		});
	});

	describe("routes", () => {
		it("merges API routes and custom domains into a unified routes array", ({
			expect,
		}) => {
			const config = makeWorkerConfig({
				routes: [
					{
						id: "route-1",
						pattern: "example.com/*",
						zone_name: "example.com",
						script: "my-worker",
					},
				],
				domains: [
					{
						id: "domain-1",
						hostname: "api.example.com",
						zone_name: "example.com",
						service: "my-worker",
						environment: "production",
						zone_id: "zone-123",
					},
				],
			});
			const result = constructWranglerConfig(config);

			expect(result.routes).toEqual([
				{ pattern: "example.com/*", zone_name: "example.com" },
				{
					pattern: "api.example.com",
					zone_name: "example.com",
					custom_domain: true,
					enabled: undefined,
					previews_enabled: undefined,
				},
			]);
		});

		it("omits routes key when both routes and domains are empty", ({
			expect,
		}) => {
			const config = makeWorkerConfig({ routes: [], domains: [] });
			const result = constructWranglerConfig(config);
			expect(result.routes).toBeUndefined();
		});
	});

	describe("placement", () => {
		it("sets placement to { mode: 'smart' } when mode is smart", ({
			expect,
		}) => {
			const config = makeWorkerConfig({
				placement: { mode: "smart" },
			});
			const result = constructWranglerConfig(config);
			expect(result.placement).toEqual({ mode: "smart" });
		});

		it("sets placement to undefined when mode is not smart", ({ expect }) => {
			const config = makeWorkerConfig({
				placement: { mode: "off" } as unknown as APIWorkerConfig["placement"],
			});
			const result = constructWranglerConfig(config);
			expect(result.placement).toBeUndefined();
		});

		it("sets placement to undefined when placement is undefined", ({
			expect,
		}) => {
			const config = makeWorkerConfig({ placement: undefined });
			const result = constructWranglerConfig(config);
			expect(result.placement).toBeUndefined();
		});
	});

	describe("durable object migrations", () => {
		it("generates migrations when DO bindings match worker name and migration_tag is set", ({
			expect,
		}) => {
			const config = makeWorkerConfig({
				name: "my-worker",
				migration_tag: "v1",
				bindings: [
					{
						type: "durable_object_namespace",
						name: "MY_DO",
						class_name: "MyDurableObject",
						script_name: "my-worker",
					},
					{
						type: "durable_object_namespace",
						name: "OTHER_DO",
						class_name: "OtherDO",
						script_name: "my-worker",
					},
				],
			});
			const result = constructWranglerConfig(config);

			expect(result.migrations).toEqual([
				{
					tag: "v1",
					new_classes: ["MyDurableObject", "OtherDO"],
				},
			]);
		});

		it("does not generate migrations when DO bindings have different script_name", ({
			expect,
		}) => {
			const config = makeWorkerConfig({
				name: "my-worker",
				migration_tag: "v1",
				bindings: [
					{
						type: "durable_object_namespace",
						name: "EXTERNAL_DO",
						class_name: "ExternalDO",
						script_name: "other-worker",
					},
				],
			});
			const result = constructWranglerConfig(config);
			expect(result.migrations).toBeUndefined();
		});

		it("does not generate migrations when migration_tag is missing", ({
			expect,
		}) => {
			const config = makeWorkerConfig({
				name: "my-worker",
				bindings: [
					{
						type: "durable_object_namespace",
						name: "MY_DO",
						class_name: "MyDO",
						script_name: "my-worker",
					},
				],
			});
			const result = constructWranglerConfig(config);
			expect(result.migrations).toBeUndefined();
		});
	});

	describe("scheduled triggers", () => {
		it("generates triggers.crons from schedules", ({ expect }) => {
			const config = makeWorkerConfig({
				schedules: [{ cron: "*/5 * * * *" }, { cron: "0 0 * * *" }],
			});
			const result = constructWranglerConfig(config);

			expect(result.triggers).toEqual({
				crons: ["*/5 * * * *", "0 0 * * *"],
			});
		});

		it("omits triggers when schedules is empty", ({ expect }) => {
			const config = makeWorkerConfig({ schedules: [] });
			const result = constructWranglerConfig(config);
			expect(result.triggers).toBeUndefined();
		});
	});

	describe("tail_consumers", () => {
		it("converts null tail_consumers to undefined (PR #11286 fix)", ({
			expect,
		}) => {
			const config = makeWorkerConfig({ tail_consumers: null });
			const result = constructWranglerConfig(config);
			expect(result.tail_consumers).toBeUndefined();
		});

		it("passes through non-null tail_consumers", ({ expect }) => {
			const consumers = [
				{ service: "logger" },
				{ service: "metrics", environment: "production" },
			];
			const config = makeWorkerConfig({ tail_consumers: consumers });
			const result = constructWranglerConfig(config);
			expect(result.tail_consumers).toEqual(consumers);
		});

		it("passes through undefined tail_consumers as undefined", ({ expect }) => {
			const config = makeWorkerConfig({ tail_consumers: undefined });
			const result = constructWranglerConfig(config);
			expect(result.tail_consumers).toBeUndefined();
		});
	});

	describe("observability", () => {
		it("passes through observability config", ({ expect }) => {
			const observability = { enabled: true, head_sampling_rate: 0.5 };
			const config = makeWorkerConfig({ observability });
			const result = constructWranglerConfig(config);
			expect(result.observability).toEqual(observability);
		});

		it("passes through undefined observability", ({ expect }) => {
			const config = makeWorkerConfig({ observability: undefined });
			const result = constructWranglerConfig(config);
			expect(result.observability).toBeUndefined();
		});
	});

	describe("limits", () => {
		it("passes through limits config", ({ expect }) => {
			const limits = { cpu_ms: 50, subrequests: 100 };
			const config = makeWorkerConfig({ limits });
			const result = constructWranglerConfig(config);
			expect(result.limits).toEqual(limits);
		});

		it("passes through undefined limits", ({ expect }) => {
			const config = makeWorkerConfig({ limits: undefined });
			const result = constructWranglerConfig(config);
			expect(result.limits).toBeUndefined();
		});
	});

	describe("bindings integration", () => {
		it("maps key binding types through to the config", ({ expect }) => {
			const config = makeWorkerConfig({
				bindings: [
					{ type: "plain_text", name: "MY_VAR", text: "hello" },
					{
						type: "kv_namespace",
						name: "MY_KV",
						namespace_id: "kv-123",
					},
					{
						type: "r2_bucket",
						name: "MY_BUCKET",
						bucket_name: "my-bucket",
					},
					{ type: "d1", name: "MY_DB", id: "db-123" },
					{
						type: "service",
						name: "MY_SERVICE",
						service: "other-worker",
					},
					{
						type: "queue",
						name: "MY_QUEUE",
						queue_name: "my-queue",
					},
				],
			});
			const result = constructWranglerConfig(config);

			expect(result.vars).toEqual({ MY_VAR: "hello" });
			expect(result.kv_namespaces).toEqual([
				{ id: "kv-123", binding: "MY_KV" },
			]);
			expect(result.r2_buckets).toEqual([
				{
					binding: "MY_BUCKET",
					bucket_name: "my-bucket",
					jurisdiction: undefined,
				},
			]);
			expect(result.d1_databases).toEqual([
				{ binding: "MY_DB", database_id: "db-123" },
			]);
			expect(result.services).toEqual([
				{
					binding: "MY_SERVICE",
					service: "other-worker",
					environment: undefined,
					entrypoint: undefined,
				},
			]);
			expect(result.queues).toEqual({
				producers: [
					{
						binding: "MY_QUEUE",
						queue: "my-queue",
						delivery_delay: undefined,
					},
				],
			});
		});

		it("handles assets binding without throwing (PR #11339 fix)", ({
			expect,
		}) => {
			const config = makeWorkerConfig({
				bindings: [{ type: "assets", name: "ASSETS" }],
			});
			const result = constructWranglerConfig(config);
			expect(result.assets).toEqual({ binding: "ASSETS" });
		});

		it("filters out secret_text bindings", ({ expect }) => {
			const config = makeWorkerConfig({
				bindings: [
					{ type: "secret_text", name: "MY_SECRET", text: "s3cret" },
					{ type: "plain_text", name: "MY_VAR", text: "hello" },
				],
			});
			const result = constructWranglerConfig(config);
			expect(result.vars).toEqual({ MY_VAR: "hello" });
			// secret_text should not appear anywhere in the output
			expect(JSON.stringify(result)).not.toContain("s3cret");
		});
	});
});
