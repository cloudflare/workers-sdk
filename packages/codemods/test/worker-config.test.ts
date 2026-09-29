import { describe, it } from "vitest";
import { renderCloudflareConfig } from "../src/codemods/wrangler-to-cf/config-renderer";
import { convertRootConfig } from "../src/codemods/wrangler-to-cf/worker-config";
import type {
	ConvertedWranglerConfig,
	MigrationFollowUp,
} from "../src/codemods/wrangler-to-cf/types";

function convert(source: Record<string, unknown>): {
	followUps: MigrationFollowUp[];
	output: string;
} {
	const followUps: MigrationFollowUp[] = [];
	const imports = new Set<string>();
	const config = convertRootConfig(source, "", "vite", imports, followUps);
	const converted: ConvertedWranglerConfig = {
		base: { config },
		environments: new Map(),
		followUps,
		imports,
		toolingEnvironments: new Map(),
	};
	return {
		followUps,
		output: renderCloudflareConfig(converted),
	};
}

describe("Wrangler Worker configuration conversion", () => {
	it("converts core settings, triggers, bindings, and exports", ({
		expect,
	}) => {
		const result = convert({
			account_id: "account-id",
			addresses: [],
			assets: {
				html_handling: "auto-trailing-slash",
				not_found_handling: "404-page",
			},
			compatibility_date: "2026-09-23",
			compatibility_flags: ["nodejs_compat"],
			connect: [
				{
					idle_timeout_ms: 5_000,
					max_pending_bytes: 65_536,
					port: 53,
					protocol: "udp",
				},
			],
			exports: {
				Counter: { storage: "sqlite", type: "durable-object" },
				Entrypoint: { cache: { enabled: true }, type: "worker" },
				Workflow: {
					concurrency: { limit: 2 },
					default_retention: {
						error_retention: 86_400_000,
						success_retention: "3 days",
					},
					limits: { steps: 10 },
					name: "example-workflow",
					schedules: ["0 * * * *", "30 * * * *"],
					type: "workflow",
				},
			},
			kv_namespaces: [{ binding: "CACHE", id: "namespace-id" }],
			main: "src/index.ts",
			name: "example-worker",
			observability: { enabled: true, head_sampling_rate: 0.5 },
			queues: {
				consumers: [{ max_batch_size: 10, queue: "jobs" }],
			},
			routes: [
				"example.com/*",
				{ custom_domain: true, pattern: "api.example.com" },
			],
			triggers: { crons: ["0 * * * *"] },
			vars: { MODE: "production" },
		});

		expect(result).toMatchSnapshot();
		expect(result.output).toContain("idleTimeoutMs: 5000");
		expect(result.output).toContain("addresses: []");
	});

	it("guards output that requires manual migration", ({ expect }) => {
		const result = convert({
			containers: [{}],
			migrations: [{ new_classes: ["Counter"], tag: "v1" }],
			routes: [{ pattern: "example.com/*", zone_id: "zone-id" }],
			site: { bucket: "./public" },
			unsafe: {
				capnp: { base_path: "./schemas" },
				metadata: { build: "test" },
			},
		});

		expect(result.followUps.map(({ code }) => code)).toEqual(
			expect.arrayContaining([
				"container-review",
				"missing-compatibility-date",
				"missing-name",
				"unsupported-field",
				"zone-id-route",
			])
		);
		expect(result.output).toContain("Migration incomplete");
		expect(result).toMatchSnapshot();
	});

	it("infers Durable Object exports from migration history", ({ expect }) => {
		const result = convert({
			compatibility_date: "2026-09-23",
			durable_objects: {
				bindings: [{ class_name: "Final", name: "COUNTER" }],
			},
			migrations: [
				{ new_classes: ["Legacy"], new_sqlite_classes: ["Removed"], tag: "v1" },
				{
					deleted_classes: ["Removed"],
					renamed_classes: [{ from: "Legacy", to: "Renamed" }],
					tag: "v2",
				},
				{ renamed_classes: [{ from: "Renamed", to: "Final" }], tag: "v3" },
			],
			name: "example-worker",
		});

		expect(result.followUps).toEqual([]);
		expect(result.output).toContain("Legacy: exports.durableObject({");
		expect(result.output.match(/renamedTo: "Final"/g)).toHaveLength(2);
		expect(result.output).toContain("Renamed: exports.durableObject({");
		expect(result.output).toContain("Final: exports.durableObject({");
		expect(result.output).toContain('storage: "legacy-kv"');
		expect(result.output).toContain("Removed: exports.durableObject({");
		expect(result.output).toContain('state: "deleted"');
	});

	it("reports Durable Object history that cannot identify storage", ({
		expect,
	}) => {
		const result = convert({
			compatibility_date: "2026-09-23",
			durable_objects: {
				bindings: [{ class_name: "Unknown", name: "COUNTER" }],
			},
			migrations: [
				{ renamed_classes: [{ from: "Missing", to: "Unknown" }], tag: "v1" },
			],
			name: "example-worker",
		});

		expect(result.followUps.map(({ code }) => code)).toContain(
			"durable-object-review"
		);
		expect(result.followUps.map(({ code }) => code)).toContain(
			"durable-object-migrations"
		);
	});

	it("keeps tail consumer targets unchanged", ({ expect }) => {
		const result = convert({
			compatibility_date: "2026-09-23",
			name: "example-worker",
			tail_consumers: [{ environment: "staging", service: "tail-worker" }],
		});

		expect(result.output).toContain('worker: "tail-worker"');
		expect(result.output).not.toContain("tail-worker-staging");
		expect(result.followUps).toEqual([]);
	});

	it("reports zone-qualified custom domains for manual review", ({
		expect,
	}) => {
		const result = convert({
			routes: [
				{
					custom_domain: true,
					pattern: "api.example.com",
					zone_id: "zone-id",
				},
				{
					custom_domain: true,
					pattern: "app.example.com",
					zone_name: "example.com",
				},
			],
		});

		expect(
			result.followUps
				.filter(({ code }) => code === "custom-domain-options")
				.map(({ blocking, sourcePath }) => ({ blocking, sourcePath }))
		).toEqual([
			{ blocking: true, sourcePath: "config.routes.0" },
			{ blocking: true, sourcePath: "config.routes.1" },
		]);
	});
});
