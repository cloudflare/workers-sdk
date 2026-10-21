import * as fs from "node:fs";
import * as path from "node:path";
import {
	bindings,
	defineContainer,
	defineWorker,
	exports,
} from "@cloudflare/config";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, test, vi } from "vitest";
import { resolvePluginConfig } from "../plugin-config";

describe("framework-owned project configuration", () => {
	runInTempDir();
	const buildEnv = { command: "build" as const, mode: "production" };

	test("resolves full configuration without reading or writing Cloudflare files", async ({
		expect,
	}) => {
		const root = process.cwd();
		// A framework explicitly supplying config must not load a second source.
		fs.writeFileSync("cloudflare.config.ts", "throw new Error('do not load');");
		fs.writeFileSync("wrangler.jsonc", "{}");
		const container = defineContainer({
			name: "api",
			image: { reference: "registry.example.com/api:latest" },
		});
		const config = await resolvePluginConfig(
			{
				projectConfig: {
					accountId: "1234567890",
					complianceRegion: "public",
					containers: [container],
					worker: defineWorker({
						name: "framework-app",
						entrypoint: "./src/index.ts",
						compatibilityDate: "2026-06-01",
						env: { GREETING: bindings.text("hello") },
						exports: {
							Api: exports.durableObject({ storage: "sqlite", container }),
						},
					}),
				},
				directory: ".void/cloudflare",
			},
			{ root },
			buildEnv
		);
		expect(config.settings).toEqual({
			accountId: "1234567890",
			complianceRegion: "public",
		});
		expect(config.containers[0]).toMatchObject({ name: "api" });
		expect(config.outputDirectory).toBe(
			path.join(root, ".void/cloudflare/output")
		);
		if (config.type !== "workers") {
			throw new Error("Expected Worker configuration");
		}
		expect(config.configPaths.size).toBe(0);
		expect(config.environmentNameToWorkerMap.get("ssr")?.config).toMatchObject({
			name: "framework-app",
			env: { GREETING: { type: "text", value: "hello" } },
			exports: { Api: { container: "api" } },
		});
		expect(fs.readFileSync("cloudflare.config.ts", "utf8")).toBe(
			"throw new Error('do not load');"
		);
		expect(fs.existsSync(".cloudflare")).toBe(false);
		expect(fs.existsSync(".void")).toBe(false);
	});

	test("evaluates async configuration with mode and preview-build context before the Worker customizer", async ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARE_PREVIEW_BUILD", "true");
		try {
			const provider = vi.fn(async ({ mode, isPreview }) => ({
				worker: {
					name: `${mode}-${isPreview ? "preview" : "production"}`,
					compatibilityDate: "2026-06-01",
				},
			}));
			const config = await resolvePluginConfig(
				{
					projectConfig: provider,
					config: { compatibilityFlags: ["nodejs_compat"] },
				},
				{},
				{ ...buildEnv, mode: "staging" }
			);
			expect(provider).toHaveBeenCalledOnce();
			expect(provider).toHaveBeenCalledWith({
				mode: "staging",
				isPreview: true,
			});
			if (config.type !== "assets-only") {
				throw new Error("Expected assets-only config");
			}
			expect(config.config).toMatchObject({
				name: "staging-preview",
				compatibilityFlags: ["nodejs_compat"],
			});
		} finally {
			vi.unstubAllEnvs();
		}
	});

	test("validates supplied configuration using the same schema as file configuration", async ({
		expect,
	}) => {
		await expect(
			resolvePluginConfig({ projectConfig: {} }, {}, buildEnv)
		).rejects.toThrow("`projectConfig` must define a Worker");
		await expect(
			resolvePluginConfig(
				{
					projectConfig: {
						worker: { name: "invalid", compatibilityDate: 123 },
					} as unknown as import("@cloudflare/config").CloudflareConfig,
				},
				{},
				buildEnv
			)
		).rejects.toThrow("Invalid `projectConfig`");
	});

	test.for([".", "..", "../outside"])(
		"rejects an unsafe generated directory: %s",
		async (directory, { expect }) => {
			await expect(
				resolvePluginConfig({ directory }, {}, buildEnv)
			).rejects.toThrow("inside the project root");
		}
	);
});
