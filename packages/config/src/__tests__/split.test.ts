import { describe, expect, it } from "vitest";
import { splitRawConfig } from "../split";
import type { RawConfig } from "@cloudflare/workers-utils";

describe("splitRawConfig", () => {
	it("maps top-level runtime fields to camelCase on the worker config", () => {
		const { worker, tooling } = splitRawConfig({
			name: "my-worker",
			main: "./src/index.ts",
			account_id: "abc",
			compatibility_date: "2026-01-01",
			compatibility_flags: ["nodejs_compat"],
			workers_dev: true,
			preview_urls: false,
			compliance_region: "fedramp_high",
			observability: { enabled: true, head_sampling_rate: 0.5 },
			limits: { cpu_ms: 50 },
		} as RawConfig);

		expect(worker).toMatchObject({
			name: "my-worker",
			entrypoint: "./src/index.ts",
			accountId: "abc",
			compatibilityDate: "2026-01-01",
			compatibilityFlags: ["nodejs_compat"],
			workersDev: true,
			previewUrls: false,
			complianceRegion: "fedramp-high",
			observability: { enabled: true, headSamplingRate: 0.5 },
			limits: { cpuMs: 50 },
		});
		expect(tooling).toEqual({});
	});

	it("converts every supported binding kind into env entries", () => {
		const { worker } = splitRawConfig({
			ai: { binding: "AI", remote: true },
			browser: { binding: "BROWSER" },
			version_metadata: { binding: "CF_VERSION" },
			kv_namespaces: [{ binding: "KV", id: "kv-id", remote: true }],
			d1_databases: [
				{ binding: "DB", database_id: "d1-id", database_name: "db" },
			],
			r2_buckets: [{ binding: "BUCKET", bucket_name: "my-bucket" }],
			services: [{ binding: "SVC", service: "other", entrypoint: "Api" }],
			queues: { producers: [{ binding: "Q", queue: "jobs" }] },
			vars: { GREETING: "hi", CONFIG: { a: 1 } },
			secrets: { required: ["API_KEY"] },
			durable_objects: {
				bindings: [{ name: "DO", class_name: "Counter" }],
			},
		} as RawConfig);

		expect(worker.env).toEqual({
			AI: { type: "ai", remote: true },
			BROWSER: { type: "browser" },
			CF_VERSION: { type: "version-metadata" },
			KV: { type: "kv", id: "kv-id", remote: true },
			DB: { type: "d1", id: "d1-id", name: "db" },
			BUCKET: { type: "r2", name: "my-bucket" },
			SVC: { type: "worker", workerName: "other", exportName: "Api" },
			Q: { type: "queue", name: "jobs" },
			GREETING: { type: "text", value: "hi" },
			CONFIG: { type: "json", value: { a: 1 } },
			API_KEY: { type: "secret" },
			DO: { type: "durable-object", exportName: "Counter" },
		});
	});

	it("maps routes/crons/queue consumers to triggers and custom domains to domains", () => {
		const { worker } = splitRawConfig({
			routes: [
				"example.com/*",
				{ pattern: "a.com/*", zone_name: "a.com" },
				{ pattern: "b.com/*", zone_id: "zone123" },
				{ pattern: "cd.com", custom_domain: true },
			],
			triggers: { crons: ["0 * * * *"] },
			queues: {
				consumers: [{ queue: "jobs", max_batch_size: 10, max_retries: 3 }],
			},
		} as RawConfig);

		expect(worker.triggers).toEqual([
			{ type: "fetch", pattern: "example.com/*" },
			{ type: "fetch", pattern: "a.com/*", zone: "a.com" },
			{ type: "fetch", pattern: "b.com/*", zone: "zone123" },
			{ type: "scheduled", schedule: "0 * * * *" },
			{ type: "queue", name: "jobs", maxBatchSize: 10, maxRetries: 3 },
		]);
		expect(worker.domains).toEqual(["cd.com"]);
	});

	it("derives DO exports from migrations (sqlite vs legacy-kv)", () => {
		const { worker } = splitRawConfig({
			migrations: [
				{ tag: "v1", new_sqlite_classes: ["Counter"] },
				{ tag: "v2", new_classes: ["Legacy"] },
			],
		} as RawConfig);

		expect(worker.exports).toEqual({
			Counter: { type: "durable-object", storage: "sqlite" },
			Legacy: { type: "durable-object", storage: "legacy-kv" },
		});
	});

	it("splits assets: runtime fields on worker, directory into tooling", () => {
		const { worker, tooling } = splitRawConfig({
			assets: {
				binding: "ASSETS",
				directory: "./public",
				html_handling: "auto-trailing-slash",
				run_worker_first: true,
			},
		} as RawConfig);

		expect((worker.env as Record<string, unknown>).ASSETS).toEqual({
			type: "assets",
		});
		expect(worker.assets).toEqual({
			htmlHandling: "auto-trailing-slash",
			runWorkerFirst: true,
		});
		expect(tooling.assetsDirectory).toBe("./public");
	});

	it("maps tooling/bundling fields into the wrangler tooling config", () => {
		const { worker, tooling } = splitRawConfig({
			name: "w",
			minify: true,
			no_bundle: false,
			build: { command: "npm run build", watch_dir: "src" },
			upload_source_maps: true,
		} as RawConfig);

		expect(worker).toEqual({ name: "w" });
		expect(tooling).toEqual({
			minify: true,
			noBundle: false,
			build: { command: "npm run build", watchDir: "src" },
			uploadSourceMaps: true,
		});
	});
});
