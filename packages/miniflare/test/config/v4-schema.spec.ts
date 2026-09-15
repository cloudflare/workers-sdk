import { describe, test } from "vitest";
import { V4MiniflareOptionsSchema } from "../../src/config/v4-schema";

describe("V4MiniflareOptionsSchema", () => {
	test("parses a single-worker v4-shaped config", ({ expect }) => {
		const parsed = V4MiniflareOptionsSchema.parse({
			rootPath: "./project",
			host: "127.0.0.1",
			port: 8787,
			logRequests: false,
			name: "worker",
			script: "export default { fetch() { return new Response() } }",
			modules: true,
			modulesRules: [{ type: "Text", include: ["**/*.txt"] }],
			compatibilityDate: "2026-01-01",
			compatibilityFlags: ["nodejs_compat"],
			bindings: { TEXT: "value", JSON: { nested: true } },
			serviceBindings: { SELF: "worker" },
			kvNamespaces: ["KV"],
			r2Buckets: {
				R2: {
					id: "bucket",
					s3Credentials: {
						accessKeyId: "access-key",
						secretAccessKey: "secret-key",
					},
				},
			},
			d1Databases: { DB: "database" },
			durableObjects: {
				OBJECT: { className: "Object", useSQLite: true },
			},
			queueProducers: { QUEUE: { queueName: "queue" } },
			queueConsumers: { queue: { maxBatchSize: 10 } },
			assets: {
				directory: "./public",
				binding: "ASSETS",
				run_worker_first: ["/api/*"],
			},
			workflows: {
				WORKFLOW: { name: "workflow", className: "Workflow" },
			},
		});

		expect(parsed).toMatchObject({
			rootPath: "./project",
			name: "worker",
			logRequests: false,
			stripDisablePrettyError: true,
			telemetry: { enabled: false },
			stripCfConnectingIp: true,
		});
	});

	test("parses a multi-worker v4-shaped config", ({ expect }) => {
		const parsed = V4MiniflareOptionsSchema.parse({
			rootPath: "./project",
			resourcePersistencePath: "./state",
			workers: [
				{
					name: "a",
					script: "export default {}",
					modules: true,
				},
				{
					name: "b",
					scriptPath: "./src/worker.ts",
					modules: true,
					browserRendering: { binding: "BROWSER" },
				},
			],
		});

		expect(parsed).toMatchObject({
			rootPath: "./project",
			resourcePersistencePath: "./state",
			workers: [{ name: "a" }, { name: "b" }],
		});
	});

	test("accepts unknown top-level keys like v4 plugin-by-plugin parsing", ({
		expect,
	}) => {
		const result = V4MiniflareOptionsSchema.safeParse({
			script: "export default {}",
			unknownFutureOption: true,
		});

		expect(result.success).toBe(true);
	});

	test("rejects invalid module rule types", ({ expect }) => {
		const result = V4MiniflareOptionsSchema.safeParse({
			script: "export default {}",
			modules: true,
			modulesRules: [{ type: "Invalid", include: ["**/*.txt"] }],
		});

		expect(result.success).toBe(false);
	});

	test("rejects invalid rate-limit periods", ({ expect }) => {
		const result = V4MiniflareOptionsSchema.safeParse({
			script: "export default {}",
			ratelimits: {
				LIMIT: {
					namespace_id: "limit",
					simple: { limit: 10, period: 30 },
				},
			},
		});

		expect(result.success).toBe(false);
	});

	test("rejects malformed known asset config fields", ({ expect }) => {
		const routerConfigResult = V4MiniflareOptionsSchema.safeParse({
			script: "export default {}",
			assets: {
				directory: "./public",
				routerConfig: { has_user_worker: "true" },
			},
		});
		const assetConfigResult = V4MiniflareOptionsSchema.safeParse({
			script: "export default {}",
			assets: {
				directory: "./public",
				assetConfig: { html_handling: "invalid" },
			},
		});

		expect(routerConfigResult.success).toBe(false);
		expect(assetConfigResult.success).toBe(false);
	});

	test("rejects email bindings with both destination forms", ({ expect }) => {
		const result = V4MiniflareOptionsSchema.safeParse({
			script: "export default {}",
			email: {
				send_email: [
					{
						name: "EMAIL",
						destination_address: "user@example.com",
						allowed_destination_addresses: ["user@example.com"],
					},
				],
			},
		});

		expect(result.success).toBe(false);
	});
});
