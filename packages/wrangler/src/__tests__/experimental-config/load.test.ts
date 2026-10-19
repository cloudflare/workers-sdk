import * as path from "node:path";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { loadNewConfig } from "../../experimental-config/load";

vi.mock("@cloudflare/config", async (importOriginal) => {
	const { createConfigMock } = await import("../helpers/mock-new-config");
	return createConfigMock(importOriginal);
});

describe("loadNewConfig", () => {
	runInTempDir();

	describe("file presence", () => {
		it("throws a UserError when cloudflare.config.ts is missing", async ({
			expect,
		}) => {
			await expect(
				loadNewConfig({ cwd: process.cwd(), args: {} })
			).rejects.toMatchObject({
				message: expect.stringContaining(
					"cloudflare.config.ts is required when --experimental-new-config is enabled."
				),
				telemetryMessage: "new-config worker config file missing",
			});
		});

		it("loads cloudflare.config.ts alone (no wrangler.config.ts)", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts":
					'export default { worker: { name: "my-worker", compatibilityDate: "2026-05-18" } };',
			});

			const result = await loadNewConfig({
				cwd: process.cwd(),
				args: {},
			});

			expect(result.rawConfig).toMatchObject({
				name: "my-worker",
				compatibility_date: "2026-05-18",
			});
			expect(result.cloudflareConfigPath).toBe(
				path.resolve("cloudflare.config.ts")
			);
			expect(result.wranglerConfigPath).toBeUndefined();
			expect(result.types).toEqual({ generate: true, includeRuntime: true });
			expect(
				result.dependencies.has(path.resolve("cloudflare.config.ts"))
			).toBe(true);
		});

		it("loads both cloudflare.config.ts and wrangler.config.ts and merges them", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts":
					'export default { worker: { name: "merged-worker", compatibilityDate: "2026-05-18" } };',
				"wrangler.config.ts":
					'export default { minify: true, assetsDirectory: "./public" };',
			});

			const result = await loadNewConfig({
				cwd: process.cwd(),
				args: {},
			});

			expect(result.rawConfig).toMatchObject({
				name: "merged-worker",
				compatibility_date: "2026-05-18",
				minify: true,
				assets: { directory: "./public" },
			});
			expect(result.wranglerConfigPath).toBe(
				path.resolve("wrangler.config.ts")
			);
		});
	});

	describe("ctx.mode propagation", () => {
		it("passes args.env into the function-form cloudflare.config.ts", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts": `
					export default (ctx) => ({
						worker: {
							name: \`worker-\${ctx.mode}\`,
							compatibilityDate: "2026-05-18",
						},
					});
				`,
			});

			const result = await loadNewConfig({
				cwd: process.cwd(),
				args: { env: "staging" },
			});

			expect(result.rawConfig.name).toBe("worker-staging");
			expect(result.mode).toBe("staging");
		});

		it("falls back to CLOUDFLARE_ENV when args.env is not provided", async ({
			expect,
		}) => {
			vi.stubEnv("CLOUDFLARE_ENV", "preview");
			await seed({
				"cloudflare.config.ts": `
					export default (ctx) => ({
						worker: {
							name: \`worker-\${ctx.mode}\`,
							compatibilityDate: "2026-05-18",
						},
					});
				`,
			});

			const result = await loadNewConfig({
				cwd: process.cwd(),
				args: {},
			});

			expect(result.rawConfig.name).toBe("worker-preview");
			expect(result.mode).toBe("preview");
		});

		it("uses undefined when neither args.env nor CLOUDFLARE_ENV is set", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts": `
					export default (ctx) => ({
						worker: {
							name: \`worker[\${ctx.mode}]\`,
							compatibilityDate: "2026-05-18",
						},
					});
				`,
			});

			const result = await loadNewConfig({
				cwd: process.cwd(),
				args: {},
			});

			expect(result.rawConfig.name).toBe("worker[undefined]");
			expect(result.mode).toBeUndefined();
		});

		it("passes ctx.mode into the function-form wrangler.config.ts", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts":
					'export default { worker: { name: "w", compatibilityDate: "2026-05-18" } };',
				"wrangler.config.ts": `
					export default (ctx) => ({
						assetsDirectory: \`./\${ctx.mode}-public\`,
					});
				`,
			});

			const result = await loadNewConfig({
				cwd: process.cwd(),
				args: { env: "preview" },
			});

			expect(result.rawConfig.assets).toEqual({
				directory: "./preview-public",
			});
		});
	});

	describe("account settings", () => {
		it("threads accountId and complianceRegion from the default export", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts": `
					export default {
						accountId: "acc-123",
						complianceRegion: "fedramp-high",
						worker: { name: "w", compatibilityDate: "2026-05-18" },
					};
				`,
			});

			const result = await loadNewConfig({ cwd: process.cwd(), args: {} });

			expect(result.rawConfig.account_id).toBe("acc-123");
			expect(result.rawConfig.compliance_region).toBe("fedramp_high");
			expect(result.parsedConfig.accountId).toBe("acc-123");
			expect(result.parsedConfig.complianceRegion).toBe("fedramp-high");
		});

		it("leaves account settings undefined when they are omitted", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts":
					'export default { worker: { name: "w", compatibilityDate: "2026-05-18" } };',
			});

			const result = await loadNewConfig({ cwd: process.cwd(), args: {} });

			expect(result.parsedConfig.accountId).toBeUndefined();
			expect(result.parsedConfig.complianceRegion).toBeUndefined();
			expect(result.rawConfig.account_id).toBeUndefined();
		});
	});

	describe("resources", () => {
		it("preserves the Containers array", async ({ expect }) => {
			await seed({
				"cloudflare.config.ts": `
					const api = { name: "api", image: { reference: "registry.example.com/api:latest" } };
					const sessions = { name: "sessions", schedulingPolicy: "durable-object" };
					export default {
						worker: { name: "primary", compatibilityDate: "2026-05-18" },
						containers: [api, sessions],
					};
				`,
			});

			const result = await loadNewConfig({ cwd: process.cwd(), args: {} });

			expect(result.parsedConfig.containers.map(({ name }) => name)).toEqual([
				"api",
				"sessions",
			]);
			expect(result.parsedConfig.containers[0]).toMatchObject({
				name: "api",
				image: { reference: "registry.example.com/api:latest" },
			});
		});

		it("includes referenced Container definitions in the raw config", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts": `
					const api = { name: "api", image: { reference: "registry.example.com/api:latest" } };
					export default {
						worker: {
							name: "primary",
							compatibilityDate: "2026-05-18",
							exports: {
								ApiContainer: { type: "durable-object", storage: "sqlite", container: api },
							},
						},
						containers: [api],
					};
				`,
			});

			const result = await loadNewConfig({ cwd: process.cwd(), args: {} });

			expect(result.rawConfig.exports).toEqual({
				ApiContainer: {
					type: "durable-object",
					storage: "sqlite",
					container: "api",
				},
			});
			expect(result.rawConfig.containers).toEqual([
				{
					name: "api",
					image: "registry.example.com/api:latest",
					max_instances: 20,
				},
			]);
		});

		it("throws when the config does not define a Worker", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts": 'export default { accountId: "acc-123" };',
			});

			await expect(
				loadNewConfig({ cwd: process.cwd(), args: {} })
			).rejects.toMatchObject({
				message: expect.stringContaining(
					"must define a Worker using the `worker` property"
				),
				telemetryMessage: "new-config worker missing",
			});
		});
	});

	describe("worker schema validation", () => {
		it("throws when cloudflare.config.ts has invalid types", async ({
			expect,
		}) => {
			// `compatibilityDate` must be a string — number triggers a Zod error.
			await seed({
				"cloudflare.config.ts":
					'export default { worker: { name: "bad", compatibilityDate: 12345 } };',
			});

			await expect(
				loadNewConfig({ cwd: process.cwd(), args: {} })
			).rejects.toMatchObject({
				message: expect.stringContaining("Invalid `cloudflare.config.ts`"),
				telemetryMessage: "new-config worker validation failed",
			});
		});

		it("formats Zod errors with dotted paths", async ({ expect }) => {
			await seed({
				"cloudflare.config.ts":
					'export default { worker: { name: 42, compatibilityDate: "2026-05-18" } };',
			});

			await expect(
				loadNewConfig({ cwd: process.cwd(), args: {} })
			).rejects.toThrow(/→ at worker\.name/);
		});
	});

	describe("wrangler.config.ts schema validation", () => {
		it("throws when a Worker config field is used at the top level", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts":
					'export default { worker: { name: "w", compatibilityDate: "2026-05-18" } };',
				// `name` is a worker-runtime field, not a tooling field; the
				// `WORKER_CONFIG_FIELD_HINTS` set turns this into a hint.
				"wrangler.config.ts":
					'export default { name: "should-be-in-cloudflare-config" };',
			});

			await expect(
				loadNewConfig({ cwd: process.cwd(), args: {} })
			).rejects.toMatchObject({
				message: expect.stringMatching(
					/Invalid `wrangler\.config\.ts`[\s\S]*Move it to cloudflare\.config\.ts/
				),
				telemetryMessage: "new-config tooling validation failed",
			});
		});

		it("throws and lists supported keys for an unknown top-level field", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts":
					'export default { worker: { name: "w", compatibilityDate: "2026-05-18" } };',
				"wrangler.config.ts": "export default { bogusField: true };",
			});

			await expect(
				loadNewConfig({ cwd: process.cwd(), args: {} })
			).rejects.toThrow(
				/bogusField is not a supported field[\s\S]*Supported top-level fields are:[\s\S]*minify/
			);
		});

		it("rejects wrong types for tooling fields", async ({ expect }) => {
			await seed({
				"cloudflare.config.ts":
					'export default { worker: { name: "w", compatibilityDate: "2026-05-18" } };',
				"wrangler.config.ts": 'export default { minify: "yes-please" };',
			});

			await expect(
				loadNewConfig({ cwd: process.cwd(), args: {} })
			).rejects.toMatchObject({
				message: expect.stringContaining("Invalid `wrangler.config.ts`"),
				telemetryMessage: "new-config tooling validation failed",
			});
		});
	});

	describe("assets merging", () => {
		it("merges worker-side asset binding/handling with tooling-side directory", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts": `
					export default {
						worker: {
							name: "w",
							compatibilityDate: "2026-05-18",
							env: { ASSETS: { type: "assets" } },
							assets: {
								htmlHandling: "force-trailing-slash",
								notFoundHandling: "404-page",
							},
						},
					};
				`,
				"wrangler.config.ts": 'export default { assetsDirectory: "./public" };',
			});

			const result = await loadNewConfig({
				cwd: process.cwd(),
				args: {},
			});

			expect(result.rawConfig.assets).toEqual({
				binding: "ASSETS",
				html_handling: "force-trailing-slash",
				not_found_handling: "404-page",
				directory: "./public",
			});
		});
	});

	describe("Email Routing", () => {
		it("loads email triggers as Wrangler addresses", async ({ expect }) => {
			await seed({
				"cloudflare.config.ts": `
					export default {
						worker: {
							name: "email-worker",
							compatibilityDate: "2026-05-18",
							triggers: [
								{
									type: "email",
									addresses: ["support@example.com", "*@example.com"],
								},
							],
						},
					};
				`,
			});

			const result = await loadNewConfig({
				cwd: process.cwd(),
				args: {},
			});

			expect(result.rawConfig.addresses).toEqual([
				"support@example.com",
				"*@example.com",
			]);
		});
	});

	describe("types.generate", () => {
		it("defaults to true when wrangler.config.ts is absent", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts":
					'export default { worker: { name: "w", compatibilityDate: "2026-05-18" } };',
			});

			const result = await loadNewConfig({
				cwd: process.cwd(),
				args: {},
			});

			expect(result.types).toEqual({ generate: true, includeRuntime: true });
		});

		it("defaults to true when wrangler.config.ts is present but does not set it", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts":
					'export default { worker: { name: "w", compatibilityDate: "2026-05-18" } };',
				"wrangler.config.ts": "export default { minify: true };",
			});

			const result = await loadNewConfig({
				cwd: process.cwd(),
				args: {},
			});

			expect(result.types).toEqual({ generate: true, includeRuntime: true });
		});

		it("honors `types.generate: false`", async ({ expect }) => {
			await seed({
				"cloudflare.config.ts":
					'export default { worker: { name: "w", compatibilityDate: "2026-05-18" } };',
				"wrangler.config.ts": "export default { types: { generate: false } };",
			});

			const result = await loadNewConfig({
				cwd: process.cwd(),
				args: {},
			});

			expect(result.types).toEqual({ generate: false, includeRuntime: true });
		});

		it("honors `types.includeRuntime: false`", async ({ expect }) => {
			await seed({
				"cloudflare.config.ts":
					'export default { worker: { name: "w", compatibilityDate: "2026-05-18" } };',
				"wrangler.config.ts":
					"export default { types: { includeRuntime: false } };",
			});

			const result = await loadNewConfig({
				cwd: process.cwd(),
				args: {},
			});

			expect(result.types).toEqual({ generate: true, includeRuntime: false });
		});

		it("is not threaded into the merged raw config", async ({ expect }) => {
			await seed({
				"cloudflare.config.ts":
					'export default { worker: { name: "w", compatibilityDate: "2026-05-18" } };',
				"wrangler.config.ts":
					"export default { types: { generate: false }, dev: { port: 1234 } };",
			});

			const result = await loadNewConfig({
				cwd: process.cwd(),
				args: {},
			});

			// `dev.port` is mapped through; `types` is consumed separately.
			expect(result.rawConfig.dev).toMatchObject({ port: 1234 });
			expect(
				(result.rawConfig as Record<string, unknown>).types
			).toBeUndefined();
		});
	});

	describe("dependencies", () => {
		it("is the union of dependencies from both files", async ({ expect }) => {
			await seed({
				"cloudflare.config.ts":
					'export default { worker: { name: "w", compatibilityDate: "2026-05-18" } };',
				"wrangler.config.ts": "export default { minify: true };",
			});

			const result = await loadNewConfig({
				cwd: process.cwd(),
				args: {},
			});

			expect(
				result.dependencies.has(path.resolve("cloudflare.config.ts"))
			).toBe(true);
			expect(result.dependencies.has(path.resolve("wrangler.config.ts"))).toBe(
				true
			);
		});
	});
});
