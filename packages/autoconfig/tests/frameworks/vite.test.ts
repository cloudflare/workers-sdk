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

	beforeEach(async () => {
		vi.spyOn(cliPackages, "installPackages").mockImplementation(async () => {});
		await writeFile("package.json", '{"type":"module"}');
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
			"export default () => { try { throw 0; } catch { return defineConfig({ plugins: [cloudflare()] }); } };",
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

		it("preserves legacy Wrangler detection of a local plugin wrapper", async ({
			expect,
		}) => {
			await writeFile(
				"vite.config.ts",
				`import * as cfVite from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
const cloudflare = () => cfVite.cloudflare();
export default defineConfig({ plugins: [cloudflare()] });\n`
			);
			const framework = new Vite({ id: "vite", name: "Vite" });
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
				["@cloudflare/vite-plugin@^2.0.0-rc.0"],
				expect.anything()
			);

			expect(existsSync("vite.config.mts")).toBe(true);
			const content = readFileSync("vite.config.mts", "utf-8");
			expect(content).toContain(
				'import { cloudflare } from "@cloudflare/vite-plugin"'
			);
			expect(content).toContain("plugins: [cloudflare()]");

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
		});

		it("uses .ts extension for Wrangler when the project has a tsconfig.json", async ({
			expect,
		}) => {
			await writeFile("tsconfig.json", "{}");

			const framework = new Vite({ id: "vite", name: "Vite" });
			await framework.configure({ ...BASE_OPTIONS, target: "wrangler" });

			expect(existsSync("vite.config.ts")).toBe(true);
			expect(existsSync("vite.config.js")).toBe(false);
		});

		it("transforms existing vite config instead of creating a new one", async ({
			expect,
		}) => {
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
			await framework.configure(BASE_OPTIONS);

			const content = readFileSync("vite.config.ts", "utf-8");
			expect(content).toContain("cloudflare()");
			// Existing plugins should be preserved
			expect(content).toContain("react()");
		});

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
			expect(existsSync("vite.config.mts")).toBe(false);
			expect(result.workerConfig).toEqual({
				assets: {
					notFoundHandling: "single-page-application",
				},
			});
		});

		it("preflights and adds a missing plugins array without changing existing settings", async ({
			expect,
		}) => {
			const filePath = "vite.config.ts";
			const source =
				'import { defineConfig } from "vite";\nexport default defineConfig(() => ({ server: { port: 3000 } }));\n';
			await writeFile(filePath, source);
			const framework = new Vite({ id: "vite", name: "Vite" });

			await framework.configure({ ...BASE_OPTIONS, dryRun: true });
			expect(readFileSync(filePath, "utf8")).toBe(source);
			expect(cliPackages.installPackages).not.toHaveBeenCalled();

			await framework.configure(BASE_OPTIONS);
			const content = readFileSync(filePath, "utf8");
			expect(content).toContain("server: { port: 3000 }");
			expect(content).toContain("plugins: [cloudflare()]");
		});

		it.for([true, false])(
			"uses the config on disk after installing (initially present: %s)",
			async (initiallyPresent, { expect }) => {
				const filePath = "vite.config.ts";
				const prefix = 'import { defineConfig } from "vite";\n';
				if (initiallyPresent) {
					await writeFile(
						filePath,
						`${prefix}export default defineConfig({ server: { port: 3000 } });\n`
					);
				}
				vi.mocked(cliPackages.installPackages).mockImplementation(async () => {
					await writeFile(
						filePath,
						`${prefix}export default defineConfig({ server: { port: 4000 } });\n`
					);
				});
				await new Vite({ id: "vite", name: "Vite" }).configure(BASE_OPTIONS);
				const result = readFileSync(filePath, "utf8");
				expect(result).toContain("server: { port: 4000 }");
				expect(result).toContain("plugins: [cloudflare()]");
			}
		);

		it("reuses an aliased Cloudflare import in the default export", async ({
			expect,
		}) => {
			const filePath = "vite.config.ts";
			await writeFile(
				filePath,
				`import { defineConfig as viteConfig } from "vite";
import { cloudflare as workers } from "@cloudflare/vite-plugin";
export default viteConfig(() => {
  function getPort() { return 3000; }
  return { server: { port: getPort() } };
});\n`
			);
			const framework = new Vite({ id: "vite", name: "Vite" });
			await framework.configure(BASE_OPTIONS);
			expect(readFileSync(filePath, "utf8")).toContain("plugins: [workers()]");
			expect(framework.isConfigured(".", { target: "wrangler" })).toBe(true);
		});

		it("detects the generated alias for a conflicting local name", async ({
			expect,
		}) => {
			const filePath = "vite.config.ts";
			await writeFile(
				filePath,
				'import { defineConfig } from "vite";\nconst cloudflare = 3000;\nexport default defineConfig({ server: { port: cloudflare } });\n'
			);
			const framework = new Vite({ id: "vite", name: "Vite" });
			await framework.configure(BASE_OPTIONS);
			expect(readFileSync(filePath, "utf8")).toContain(
				"plugins: [cloudflare2()]"
			);
			expect(framework.isConfigured(".", { target: "wrangler" })).toBe(true);
		});

		it.for([
			["js", "{}"],
			["ts", "{}"],
		])(
			"loads the plugin dynamically for a .%s config in a CommonJS package",
			async ([extension, manifest], { expect }) => {
				const filePath = `vite.config.${extension}`;
				const source =
					'import { defineConfig } from "vite";\nexport default defineConfig({});\n';
				await writeFile("package.json", manifest);
				await writeFile(filePath, source);
				const framework = new Vite({ id: "vite", name: "Vite" });
				await framework.configure(BASE_OPTIONS);
				const editedConfig = readFileSync(filePath, "utf8");
				expect(editedConfig).toContain(
					'import("@cloudflare/vite-plugin").then('
				);
				await framework.configure(BASE_OPTIONS);
				expect(readFileSync(filePath, "utf8")).toBe(editedConfig);
			}
		);

		it("rejects reusing a static plugin import in a bundled CommonJS config before installing", async ({
			expect,
		}) => {
			await writeFile("package.json", "{}");
			const source = `import { defineConfig } from "vite";
import { cloudflare as workers } from "@cloudflare/vite-plugin";
export default defineConfig({});
`;
			await writeFile("vite.config.ts", source);
			await expect(
				new Vite({ id: "vite", name: "Vite" }).configure(BASE_OPTIONS)
			).rejects.toThrow(
				"CommonJS Vite configuration with a static Cloudflare plugin import"
			);
			expect(cliPackages.installPackages).not.toHaveBeenCalled();
			expect(readFileSync("vite.config.ts", "utf8")).toBe(source);
		});

		it.for([
			{ build: "vite build --configLoader=native", nativeBuild: true },
			{ build: "vite build --app --configLoader native", nativeBuild: true },
			{ build: "vite build --configLoader native -w", nativeBuild: false },
			{ build: "vite build --configLoader native --watch", nativeBuild: false },
			{
				build: "tsc -b --watch && vite build --configLoader native",
				nativeBuild: false,
			},
			{
				build: "tsc -b -w && vite build --configLoader native",
				nativeBuild: false,
			},
			{
				build: "tsc -b --watch false -w && vite build --configLoader native",
				nativeBuild: false,
			},
			{
				build: "tsc @args.txt && vite build --configLoader native",
				nativeBuild: false,
			},
			{
				build: "vite build --configLoader native --profile=name",
				nativeBuild: false,
			},
			{
				build: "vite build --configLoader native --outDir dist",
				nativeBuild: true,
			},
			{
				build: "tsc -b && vite build --sourcemap --configLoader native",
				nativeBuild: true,
			},
			{ build: "vite build", nativeBuild: false },
			{
				build: "vite build --configLoader native --config other.mjs",
				nativeBuild: false,
			},
			{
				build: "vite build --configLoader native --configLoader bundle",
				nativeBuild: false,
			},
		])(
			"requires native loading of the default config in both scripts ($build)",
			async ({ build, nativeBuild }, { expect }) => {
				const source =
					'import { defineConfig } from "vite";\nexport default defineConfig({});\n';
				await writeFile(
					"package.json",
					JSON.stringify({
						scripts: {
							dev: "vite --host 0.0.0.0 --configLoader native --cors --open /docs",
							build,
						},
					})
				);
				await writeFile("vite.config.js", source);
				const framework = new Vite({ id: "vite", name: "Vite" });
				await framework.configure(BASE_OPTIONS);
				const [major, minor] = process.versions.node.split(".").map(Number);
				if (nativeBuild && (major > 22 || (major === 22 && minor >= 7))) {
					expect(readFileSync("vite.config.js", "utf8")).toContain(
						"plugins: [cloudflare()]"
					);
				} else {
					expect(readFileSync("vite.config.js", "utf8")).toContain(
						'import("@cloudflare/vite-plugin").then('
					);
				}
			}
		);

		it("creates an explicitly ESM config under a CommonJS package", async ({
			expect,
		}) => {
			await writeFile("package.json", "{}");
			await new Vite({ id: "vite", name: "Vite" }).configure(BASE_OPTIONS);
			expect(readFileSync("vite.config.mts", "utf8")).toContain(
				"plugins: [cloudflare()]"
			);
		});

		it.for([
			'import type { Plugin } from "@cloudflare/vite-plugin";',
			'import { type Plugin } from "@cloudflare/vite-plugin";',
			'import "@cloudflare/vite-plugin";',
		])(
			"keeps %s while adding a separate plugin value import",
			async (importLine, { expect }) => {
				const filePath = "vite.config.ts";
				await writeFile(
					filePath,
					`${importLine}\nimport { defineConfig } from "vite";\nexport default defineConfig({});\n`
				);
				await new Vite({ id: "vite", name: "Vite" }).configure(BASE_OPTIONS);
				const result = readFileSync(filePath, "utf8");
				expect(result).toContain(importLine);
				expect(result).toContain("plugins: [cloudflare()]");
			}
		);

		it("accepts a typed default export from vitest/config", async ({
			expect,
		}) => {
			const filePath = "vite.config.ts";
			await writeFile(
				filePath,
				'import { defineConfig } from "vitest/config";\nimport type { UserConfig } from "vite";\nexport default (defineConfig({}) as UserConfig) satisfies UserConfig;\n'
			);
			await new Vite({ id: "vite", name: "Vite" }).configure(BASE_OPTIONS);
			const result = readFileSync(filePath, "utf8");
			expect(result).toContain("plugins: [cloudflare()]");
			expect(result).toContain("as UserConfig) satisfies UserConfig");
		});

		it("rejects a callback-local plugin that shadows an existing import", async ({
			expect,
		}) => {
			const filePath = "vite.config.ts";
			const source = `import { defineConfig } from "vite";
import { cloudflare as workers } from "@cloudflare/vite-plugin";
export default defineConfig(() => {
  const workers = () => ({ name: "other" });
  return { plugins: [workers()] };
});\n`;
			await writeFile(filePath, source);
			const framework = new Vite({ id: "vite", name: "Vite" });
			expect(framework.isConfigured(".", { target: "wrangler" })).toBe(false);
			await expect(framework.configure(BASE_OPTIONS)).rejects.toThrow(
				"shadows the Cloudflare plugin import (workers)"
			);
			expect(cliPackages.installPackages).not.toHaveBeenCalled();
			expect(readFileSync(filePath, "utf8")).toBe(source);
		});

		it("preserves an unsupported config created during installation", async ({
			expect,
		}) => {
			const filePath = "vite.config.ts";
			const source = "export default { plugins: [] };\n";
			vi.mocked(cliPackages.installPackages).mockImplementation(async () => {
				await writeFile(filePath, source);
			});
			await expect(
				new Vite({ id: "vite", name: "Vite" }).configure(BASE_OPTIONS)
			).rejects.toThrow("could not find a supported defineConfig() call");
			expect(readFileSync(filePath, "utf8")).toBe(source);
			expect(existsSync("vite.config.js")).toBe(false);
		});
	});
});
