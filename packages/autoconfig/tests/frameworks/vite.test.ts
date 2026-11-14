import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import * as cliPackages from "@cloudflare/cli-shared-helpers/packages";
import { NpmPackageManager } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { Vite } from "../../src/frameworks/vite";
import { createMockContext } from "../helpers/mock-context";

const context = createMockContext();

const BASE_OPTIONS = {
	target: "cf" as const,
	projectPath: ".",
	workerName: "my-vite-app",
	outputDir: "dist",
	dryRun: false,
	packageManager: NpmPackageManager,
	isWorkspaceRoot: false,
	context,
};

describe("Vite framework", () => {
	runInTempDir();

	beforeEach(() => {
		vi.spyOn(cliPackages, "installPackages").mockImplementation(async () => {});
	});

	it("accepts Cloudflare modes", ({ expect }) => {
		const framework = new Vite({ id: "vite", name: "Vite" });

		expect(framework.supportsMode).toBe(true);
	});

	describe("isConfigured()", () => {
		it("returns false when no vite config file exists", ({ expect }) => {
			const framework = new Vite({ id: "vite", name: "Vite" });
			expect(framework.isConfigured(".")).toBe(false);
		});

		it.for([
			"export default mergeConfig(base, defineConfig({ plugins: [cloudflare()] }));",
			"export default () => defineConfig({ plugins: [cloudflare()] });",
			"const config = defineConfig({ plugins: [cloudflare()] }); export { config as default };",
		])(
			"preserves Wrangler detection of wrapped and indirect exports: %s",
			async (config, { expect }) => {
				await writeFile(
					"vite.config.ts",
					`import { cloudflare } from '@cloudflare/vite-plugin'; import { defineConfig, mergeConfig } from 'vite'; ${config}`
				);
				const framework = new Vite({ id: "vite", name: "Vite" });
				expect(framework.isConfigured(".", { target: "wrangler" })).toBe(true);
			}
		);

		it("only treats the Cloudflare plugin as configured in legacy Wrangler mode", async ({
			expect,
		}) => {
			await writeFile(
				"vite.config.ts",
				`import { cloudflare } from "@cloudflare/vite-plugin";
				 import { defineConfig } from "vite";
				 export default defineConfig({ plugins: [cloudflare()] });`
			);
			const framework = new Vite({ id: "vite", name: "Vite" });

			expect(framework.isConfigured(".")).toBe(false);
			expect(framework.isConfigured(".", { target: "wrangler" })).toBe(true);
		});
	});

	describe("configure()", () => {
		it.for([
			{ extension: "cjs", dryRun: false },
			{ extension: "cjs", dryRun: true },
			{ extension: "cts", dryRun: false },
			{ extension: "cts", dryRun: true },
		])(
			"rejects CommonJS source before installing (.%s)",
			async ({ extension, dryRun }, { expect }) => {
				const filePath = `vite.config.${extension}`;
				const content =
					"const { defineConfig } = require('vite'); module.exports = defineConfig({ plugins: [] });";
				await writeFile(filePath, content);
				const framework = new Vite({ id: "vite", name: "Vite" });
				await expect(
					framework.configure({ ...BASE_OPTIONS, dryRun })
				).rejects.toThrow(
					"Cannot automatically modify a CommonJS Vite configuration"
				);
				expect(cliPackages.installPackages).not.toHaveBeenCalled();
				expect(readFileSync(filePath, "utf8")).toBe(content);
			}
		);

		it.for([
			"export default defineConfig({ plugins: [] });",
			"const config = defineConfig({ plugins: [] }); export default config;",
			"const config = defineConfig({ plugins: [] }); export { config as default };",
			"export default defineConfig({ plugins: [] }) as UserConfig;",
		])(
			"rejects ESM syntax in .cts before installing: %s",
			async (source, { expect }) => {
				const filePath = "vite.config.cts";
				const content = `import { defineConfig, type UserConfig } from 'vite'; ${source}`;
				await writeFile(filePath, content);
				const framework = new Vite({ id: "vite", name: "Vite" });
				for (const dryRun of [true, false]) {
					await expect(
						framework.configure({ ...BASE_OPTIONS, dryRun })
					).rejects.toThrow(
						"Convert it to ESM (import/export) in vite.config.mjs or vite.config.mts"
					);
					expect(cliPackages.installPackages).not.toHaveBeenCalled();
					expect(readFileSync(filePath, "utf8")).toBe(content);
				}
			}
		);

		it("creates a vite config with the cloudflare plugin when no config file exists", async ({
			expect,
		}) => {
			const framework = new Vite({ id: "vite", name: "Vite" });
			const result = await framework.configure(BASE_OPTIONS);
			expect(cliPackages.installPackages).toHaveBeenCalledWith(
				"npm",
				["@cloudflare/vite-plugin@^2.0.0-beta.v.0"],
				expect.anything()
			);

			expect(existsSync("vite.config.js")).toBe(true);
			const content = readFileSync("vite.config.js", "utf-8");
			expect(content).toContain(
				'import { cloudflare } from "@cloudflare/vite-plugin"'
			);
			expect(content).toContain(
				"plugins: [cloudflare({ remoteBindings: false })]"
			);

			expect(result.workerConfig).toEqual({
				assets: {
					notFoundHandling: "single-page-application",
				},
			});
			expect(result.buildTool).toBe("vite");
		});

		it("installs the stable plugin for Wrangler", async ({ expect }) => {
			const framework = new Vite({ id: "vite", name: "Vite" });
			await framework.configure({ ...BASE_OPTIONS, target: "wrangler" });

			expect(cliPackages.installPackages).toHaveBeenCalledWith(
				"npm",
				["@cloudflare/vite-plugin"],
				expect.anything()
			);
			expect(readFileSync("vite.config.js", "utf8")).toContain(
				"plugins: [cloudflare()]"
			);
		});

		it("uses .ts extension when the project has a tsconfig.json", async ({
			expect,
		}) => {
			await writeFile("tsconfig.json", "{}");

			const framework = new Vite({ id: "vite", name: "Vite" });
			await framework.configure(BASE_OPTIONS);

			expect(existsSync("vite.config.ts")).toBe(true);
			expect(existsSync("vite.config.js")).toBe(false);
			expect(readFileSync("vite.config.ts", "utf8")).toContain(
				"plugins: [cloudflare({ remoteBindings: false })]"
			);
		});

		it.for(["cf", "wrangler"] as const)(
			"transforms existing vite config for %s",
			async (target, { expect }) => {
				await writeFile(
					"vite.config.ts",
					`
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()]
});
`
				);

				const framework = new Vite({ id: "vite", name: "Vite" });
				await framework.configure({ ...BASE_OPTIONS, target });

				const content = readFileSync("vite.config.ts", "utf-8");
				if (target === "cf") {
					expect(content).toMatch(
						/cloudflare\(\{\s*remoteBindings: false\s*\}\)/
					);
				} else {
					expect(content).toContain("cloudflare()");
				}
				// Existing plugins should be preserved
				expect(content).toContain("react()");
			}
		);

		it("does not create or modify files in dry-run mode", async ({
			expect,
		}) => {
			const framework = new Vite({ id: "vite", name: "Vite" });
			const result = await framework.configure({
				...BASE_OPTIONS,
				dryRun: true,
			});

			expect(existsSync("vite.config.ts")).toBe(false);
			expect(existsSync("vite.config.js")).toBe(false);
			expect(result.workerConfig).toEqual({
				assets: {
					notFoundHandling: "single-page-application",
				},
			});
		});
	});
});
