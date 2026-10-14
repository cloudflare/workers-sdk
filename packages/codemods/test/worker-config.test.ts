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
				"durable-object-migrations",
				"missing-compatibility-date",
				"missing-name",
				"unsupported-field",
				"zone-id-route",
			])
		);
		expect(result.output).toContain("Migration incomplete");
		expect(result).toMatchSnapshot();
	});

	it("reports invalid dependency instrumentation configuration", ({
		expect,
	}) => {
		for (const dependenciesInstrumentation of [
			{ enabled: "false" },
			{ enabled: true, exclude_packages: "@internal/*" },
			{ enabled: true, exclude_packages: [123] },
			{ enabled: true, unknown_field: true },
		]) {
			const result = convert({
				compatibility_date: "2026-09-23",
				dependencies_instrumentation: dependenciesInstrumentation,
				name: "example-worker",
			});

			expect(result.followUps).toEqual([
				expect.objectContaining({
					blocking: true,
					code: "unsupported-field",
					message:
						"The dependency instrumentation configuration is invalid and was not migrated.",
					sourcePath: "dependencies_instrumentation",
				}),
			]);
		}
	});

	it("reports how to preserve disabled dependency instrumentation", ({
		expect,
	}) => {
		const result = convert({
			compatibility_date: "2026-09-23",
			dependencies_instrumentation: { enabled: false },
			name: "example-worker",
		});

		expect(result.followUps).toEqual([
			expect.objectContaining({
				blocking: true,
				code: "dependencies-instrumentation-opt-out",
				message:
					"Set CLOUDFLARE_DEPENDENCIES_INSTRUMENTATION=false before deploying to keep package dependency metadata disabled.",
				sourcePath: "dependencies_instrumentation",
			}),
		]);
		expect(result.output).toContain(
			"CLOUDFLARE_DEPENDENCIES_INSTRUMENTATION=false"
		);
		expect(result.output).toContain("Migration incomplete");
	});

	it("reports exclusions when dependency instrumentation is disabled", ({
		expect,
	}) => {
		const result = convert({
			compatibility_date: "2026-09-23",
			dependencies_instrumentation: {
				enabled: false,
				exclude_packages: ["@internal/*"],
			},
			name: "example-worker",
		});

		expect(result.followUps).toEqual([
			expect.objectContaining({
				blocking: true,
				code: "dependencies-instrumentation-opt-out",
				message: expect.stringContaining(
					"The package exclusion list was not migrated"
				),
				sourcePath: "dependencies_instrumentation",
			}),
		]);
		expect(result.output).toContain(
			"if dependency metadata is later enabled, those packages will be included"
		);
	});

	it("drops enabled dependency instrumentation without follow-up work", ({
		expect,
	}) => {
		const result = convert({
			compatibility_date: "2026-09-23",
			dependencies_instrumentation: { enabled: true },
			name: "example-worker",
		});

		expect(result.followUps).toEqual([]);
		expect(result.output).not.toContain(
			"CLOUDFLARE_DEPENDENCIES_INSTRUMENTATION"
		);
		expect(result.output).not.toContain("Migration incomplete");
	});

	it("reports dependency package exclusions that cannot be preserved", ({
		expect,
	}) => {
		const result = convert({
			compatibility_date: "2026-09-23",
			dependencies_instrumentation: {
				enabled: true,
				exclude_packages: ["@internal/*"],
			},
			name: "example-worker",
		});

		expect(result.followUps).toEqual([
			expect.objectContaining({
				blocking: true,
				code: "dependencies-instrumentation-exclusions",
				message: expect.stringContaining(
					"only enables or disables dependency metadata as a whole"
				),
				sourcePath: "dependencies_instrumentation",
			}),
		]);
	});

	it("converts Workflow bindings and exports the Workflows the Worker defines", ({
		expect,
	}) => {
		const result = convert({
			compatibility_date: "2026-09-23",
			exports: {
				DeclaredWorkflow: { name: "declared-workflow", type: "workflow" },
			},
			main: "src/index.ts",
			name: "example-worker",
			workflows: [
				{
					binding: "LOCAL",
					class_name: "LocalWorkflow",
					concurrency: { limit: 2 },
					default_retention: {
						error_retention: 86_400_000,
						success_retention: "3 days",
					},
					limits: { steps: 10 },
					name: "local-workflow",
					schedules: "0 * * * *",
				},
				{
					binding: "DECLARED",
					class_name: "DeclaredWorkflow",
					name: "declared-workflow",
				},
				{
					binding: "REMOTE",
					class_name: "RemoteWorkflow",
					limits: { steps: 5 },
					name: "remote-workflow",
					script_name: "other-worker",
				},
			],
		});

		expect(result.output).toContain("bindings.workflow({");
		expect(result.output).toContain('worker: "other-worker"');
		expect(result.output).toContain("LocalWorkflow: exports.workflow({");
		expect(result.output).toContain("defaultRetention: {");
		expect(result.output).not.toContain("RemoteWorkflow: exports.workflow(");
		expect(
			result.output.match(/DeclaredWorkflow: exports\.workflow\(/g)
		).toHaveLength(1);
		expect(
			result.followUps
				.filter(({ sourcePath }) => sourcePath?.includes("workflows"))
				.map(({ code, sourcePath }) => ({ code, sourcePath }))
		).toEqual([
			{ code: "unsupported-binding-options", sourcePath: "workflows.2" },
		]);
		expect(result).toMatchSnapshot();
	});

	it("treats a Workflow whose script_name names this Worker as local", ({
		expect,
	}) => {
		const result = convert({
			compatibility_date: "2026-09-23",
			main: "src/index.ts",
			name: "app",
			workflows: [
				{
					binding: "JOBS",
					class_name: "Jobs",
					limits: { steps: 10 },
					name: "jobs",
					script_name: "app",
				},
			],
		});

		expect(result.output).toContain('worker: "app"');
		expect(result.output).toContain("Jobs: exports.workflow({");
		expect(result.output).toContain("steps: 10");
		expect(
			result.followUps.filter(({ sourcePath }) =>
				sourcePath?.includes("workflows")
			)
		).toEqual([]);
		expect(result).toMatchSnapshot();
	});

	it("reports the settings of a second Workflow on an already exported class", ({
		expect,
	}) => {
		const result = convert({
			compatibility_date: "2026-09-23",
			main: "src/index.ts",
			name: "app",
			workflows: [
				{
					binding: "FIRST",
					class_name: "Runner",
					limits: { steps: 10 },
					name: "first",
				},
				{
					binding: "SECOND",
					class_name: "Runner",
					limits: { steps: 20 },
					name: "second",
				},
			],
		});

		expect(result.output).toContain("steps: 10");
		expect(result.output).not.toContain("steps: 20");
		expect(
			result.followUps
				.filter(({ sourcePath }) => sourcePath?.includes("workflows"))
				.map(({ blocking, code, sourcePath }) => ({
					blocking,
					code,
					sourcePath,
				}))
		).toEqual([
			{
				blocking: true,
				code: "workflow-shared-class",
				sourcePath: "workflows.1",
			},
		]);
		expect(result).toMatchSnapshot();
	});

	it("merges a Workflow binding's settings into the export declaring the same Workflow", ({
		expect,
	}) => {
		const result = convert({
			compatibility_date: "2026-09-23",
			exports: {
				Jobs: { name: "jobs", schedules: "0 * * * *", type: "workflow" },
			},
			main: "src/index.ts",
			name: "app",
			workflows: [
				{
					binding: "JOBS",
					class_name: "Jobs",
					limits: { steps: 10 },
					name: "jobs",
				},
			],
		});

		expect(result.output.match(/Jobs: exports\.workflow\(/g)).toHaveLength(1);
		expect(result.output).toContain("steps: 10");
		expect(result.output).toContain('schedules: "0 * * * *"');
		expect(
			result.followUps.filter(({ sourcePath }) =>
				sourcePath?.includes("workflows")
			)
		).toEqual([]);
		expect(result).toMatchSnapshot();
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
