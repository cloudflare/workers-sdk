import * as fs from "node:fs";
import * as path from "node:path";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { loadNewConfig } from "../../experimental-config/load";

// ─────────────────────────────────────────────────────────────────────────────
// Mock `@cloudflare/config`
// ─────────────────────────────────────────────────────────────────────────────
//
// `loadNewConfig` calls into `@cloudflare/config`'s `loadConfig`, which uses
// `module.registerHooks` to register hooks for `.ts` files and `cf-worker`
// import attributes. That mechanism does not run inside vitest's module
// runner, so we cannot invoke the real loader here.
//
// Mocking `loadConfig` lets us "load" arbitrary seeded files inside the temp
// dir without going through Node's module hooks. We use `import("data:...")`
// to evaluate the file as ESM so the function-form configs work naturally.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("@cloudflare/config", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;

	async function loadConfig(configPath: string) {
		const source = await fs.promises.readFile(configPath, "utf8");
		// Evaluate via a data URL — preserves ESM semantics (top-level await,
		// default export, etc.) without triggering Node's `.ts` hooks.
		const mod = (await import(
			`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
		)) as { default: unknown };
		return {
			config: mod.default,
			dependencies: new Set<string>([path.resolve(configPath)]),
		};
	}

	return {
		...actual,
		loadConfig,
	};
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
					'export default { name: "my-worker", compatibilityDate: "2026-05-18" };',
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
			expect(result.types).toEqual({ generate: true });
			expect(
				result.dependencies.has(path.resolve("cloudflare.config.ts"))
			).toBe(true);
		});

		it("loads both cloudflare.config.ts and wrangler.config.ts and merges them", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts":
					'export default { name: "merged-worker", compatibilityDate: "2026-05-18" };',
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
						name: \`worker-\${ctx.mode}\`,
						compatibilityDate: "2026-05-18",
					});
				`,
			});

			const result = await loadNewConfig({
				cwd: process.cwd(),
				args: { env: "staging" },
			});

			expect(result.rawConfig.name).toBe("worker-staging");
		});

		it("falls back to CLOUDFLARE_ENV when args.env is not provided", async ({
			expect,
		}) => {
			vi.stubEnv("CLOUDFLARE_ENV", "preview");
			await seed({
				"cloudflare.config.ts": `
					export default (ctx) => ({
						name: \`worker-\${ctx.mode}\`,
						compatibilityDate: "2026-05-18",
					});
				`,
			});

			const result = await loadNewConfig({
				cwd: process.cwd(),
				args: {},
			});

			expect(result.rawConfig.name).toBe("worker-preview");
		});

		it("uses undefined when neither args.env nor CLOUDFLARE_ENV is set", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts": `
					export default (ctx) => ({
						name: \`worker[\${ctx.mode}]\`,
						compatibilityDate: "2026-05-18",
					});
				`,
			});

			const result = await loadNewConfig({
				cwd: process.cwd(),
				args: {},
			});

			expect(result.rawConfig.name).toBe("worker[undefined]");
		});

		it("passes ctx.mode into the function-form wrangler.config.ts", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts":
					'export default { name: "w", compatibilityDate: "2026-05-18" };',
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

	describe("worker schema validation", () => {
		it("throws when cloudflare.config.ts has invalid types", async ({
			expect,
		}) => {
			// `compatibilityDate` must be a string — number triggers a Zod error.
			await seed({
				"cloudflare.config.ts":
					'export default { name: "bad", compatibilityDate: 12345 };',
			});

			await expect(
				loadNewConfig({ cwd: process.cwd(), args: {} })
			).rejects.toMatchObject({
				message: expect.stringContaining("Invalid `cloudflare.config.ts`"),
				telemetryMessage: "new-config worker validation failed",
			});
		});

		it("formats Zod errors as a bulleted list with dotted paths", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts":
					'export default { name: 42, compatibilityDate: "2026-05-18" };',
			});

			await expect(
				loadNewConfig({ cwd: process.cwd(), args: {} })
			).rejects.toThrow(/\s*•\s+name:/);
		});
	});

	describe("wrangler.config.ts schema validation", () => {
		it("throws when a Worker config field is used at the top level", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts":
					'export default { name: "w", compatibilityDate: "2026-05-18" };',
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
					'export default { name: "w", compatibilityDate: "2026-05-18" };',
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
					'export default { name: "w", compatibilityDate: "2026-05-18" };',
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
						name: "w",
						compatibilityDate: "2026-05-18",
						env: { ASSETS: { type: "assets" } },
						assets: {
							htmlHandling: "force-trailing-slash",
							notFoundHandling: "404-page",
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

	describe("types.generate", () => {
		it("defaults to true when wrangler.config.ts is absent", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts":
					'export default { name: "w", compatibilityDate: "2026-05-18" };',
			});

			const result = await loadNewConfig({
				cwd: process.cwd(),
				args: {},
			});

			expect(result.types).toEqual({ generate: true });
		});

		it("defaults to true when wrangler.config.ts is present but does not set it", async ({
			expect,
		}) => {
			await seed({
				"cloudflare.config.ts":
					'export default { name: "w", compatibilityDate: "2026-05-18" };',
				"wrangler.config.ts": "export default { minify: true };",
			});

			const result = await loadNewConfig({
				cwd: process.cwd(),
				args: {},
			});

			expect(result.types).toEqual({ generate: true });
		});

		it("honors `dev.types.generate: false`", async ({ expect }) => {
			await seed({
				"cloudflare.config.ts":
					'export default { name: "w", compatibilityDate: "2026-05-18" };',
				"wrangler.config.ts":
					"export default { dev: { types: { generate: false } } };",
			});

			const result = await loadNewConfig({
				cwd: process.cwd(),
				args: {},
			});

			expect(result.types).toEqual({ generate: false });
		});

		it("is not threaded into the merged rawConfig.dev", async ({ expect }) => {
			await seed({
				"cloudflare.config.ts":
					'export default { name: "w", compatibilityDate: "2026-05-18" };',
				"wrangler.config.ts":
					"export default { dev: { types: { generate: false }, port: 1234 } };",
			});

			const result = await loadNewConfig({
				cwd: process.cwd(),
				args: {},
			});

			// `dev.port` is mapped through; `dev.types` is intentionally not.
			expect(result.rawConfig.dev).toMatchObject({ port: 1234 });
			expect(
				(result.rawConfig.dev as Record<string, unknown>).types
			).toBeUndefined();
		});
	});

	describe("dependencies", () => {
		it("is the union of dependencies from both files", async ({ expect }) => {
			await seed({
				"cloudflare.config.ts":
					'export default { name: "w", compatibilityDate: "2026-05-18" };',
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
