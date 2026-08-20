import { existsSync, readFileSync } from "node:fs";
import * as cliPackages from "@cloudflare/cli-shared-helpers/packages";
import { NpmPackageManager } from "@cloudflare/workers-utils";
import {
	mockConsoleMethods,
	runInTempDir,
	seed,
} from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { Framework } from "../src/frameworks/framework-class";
import { Static } from "../src/frameworks/static";
import { runAutoConfig } from "../src/run";
import { createMockContext } from "./helpers/mock-context";
import type { ConfigurationResults } from "../src/frameworks/framework-class";

class ExternalWorkerConfigFramework extends Framework {
	configure(): ConfigurationResults {
		return {
			buildTool: "wrangler",
			workerConfig: null,
			buildConfig: { assetsDirectory: "dist" },
		};
	}
}

class ViteBuildToolFramework extends Framework {
	configure(): ConfigurationResults {
		return {
			buildTool: "vite",
			workerConfig: { entrypoint: "src/index.ts" },
		};
	}
}

describe("runAutoConfig()", () => {
	runInTempDir();
	mockConsoleMethods();

	it("creates new configuration and cf scripts by default", async ({
		expect,
	}) => {
		const installWrangler = vi
			.spyOn(cliPackages, "installWrangler")
			.mockResolvedValue();
		const packageJson = {
			name: "my-static-app",
			scripts: { build: "generate && vite build" },
		};
		await seed({
			"package.json": JSON.stringify(packageJson),
			"public/index.html": "<h1>Hello World</h1>",
		});

		const summary = await runAutoConfig(
			{
				configured: false,
				projectPath: process.cwd(),
				workerName: "my-static-app",
				framework: new Static({ id: "static", name: "Static" }),
				buildCommand: "npm run build",
				outputDir: "public",
				packageJson,
				packageManager: NpmPackageManager,
			},
			{
				context: createMockContext(),
				skipConfirmations: true,
				runBuild: false,
				enableTargetCliInstallation: false,
			}
		);

		expect(summary.workerConfig).toMatchObject({
			name: "my-static-app",
			observability: { enabled: true },
		});
		expect(summary.buildConfig).toEqual({ assetsDirectory: "public" });
		expect(summary.deployCommand).toBe("npx cf deploy");
		expect(summary.versionCommand).toBe("npx cf versions upload");
		expect(readFileSync("cloudflare.config.ts", "utf8")).toContain(
			'import { defineWorker } from "cf/config";\n\nexport default defineWorker({\n  "name": "my-static-app"'
		);
		expect(readFileSync("wrangler.config.ts", "utf8")).toContain(
			'import { defineWranglerConfig } from "wrangler/experimental-config";\n\nexport default defineWranglerConfig({\n  "assetsDirectory": "public"'
		);
		expect(existsSync("wrangler.jsonc")).toBe(false);
		expect(installWrangler).toHaveBeenCalledWith("npm", false);
		expect(JSON.parse(readFileSync("package.json", "utf8"))).toMatchObject({
			scripts: {
				build: "generate && vite build",
				deploy: "npm run build && cf deploy --no-build",
				preview: "cf dev",
			},
		});
	});

	it("installs cf and Wrangler for cf projects", async ({ expect }) => {
		const installPackages = vi
			.spyOn(cliPackages, "installPackages")
			.mockResolvedValue();
		const installWrangler = vi
			.spyOn(cliPackages, "installWrangler")
			.mockResolvedValue();
		const packageJson = { name: "my-static-app" };
		await seed({
			"package.json": JSON.stringify(packageJson),
			"public/index.html": "<h1>Hello World</h1>",
		});

		await runAutoConfig(
			{
				configured: false,
				projectPath: process.cwd(),
				workerName: "my-static-app",
				framework: new Static({ id: "static", name: "Static" }),
				outputDir: "public",
				packageJson,
				packageManager: NpmPackageManager,
			},
			{
				context: createMockContext(),
				skipConfirmations: true,
				runBuild: false,
			}
		);

		expect(installPackages).toHaveBeenCalledWith("npm", ["cf@latest"], {
			dev: true,
			isWorkspaceRoot: false,
		});
		expect(installWrangler).toHaveBeenCalledWith("npm", false);
	});

	it("does not install Wrangler when cf delegates to Vite", async ({
		expect,
	}) => {
		const installPackages = vi
			.spyOn(cliPackages, "installPackages")
			.mockResolvedValue();
		const installWrangler = vi
			.spyOn(cliPackages, "installWrangler")
			.mockResolvedValue();
		const packageJson = { name: "my-vite-app" };
		await seed({
			"package.json": JSON.stringify(packageJson),
			"dist/index.html": "<h1>Hello World</h1>",
			"tsconfig.json": "{}",
		});

		await runAutoConfig(
			{
				configured: false,
				projectPath: process.cwd(),
				workerName: "my-vite-app",
				framework: new ViteBuildToolFramework({
					id: "static",
					name: "Static",
				}),
				outputDir: "dist",
				packageJson,
				packageManager: NpmPackageManager,
			},
			{
				context: createMockContext(),
				skipConfirmations: true,
				runBuild: false,
			}
		);

		expect(installPackages).toHaveBeenCalledWith("npm", ["cf@latest"], {
			dev: true,
			isWorkspaceRoot: false,
		});
		expect(installWrangler).not.toHaveBeenCalled();
		expect(JSON.parse(readFileSync("package.json", "utf8"))).toMatchObject({
			scripts: {
				"cf-typegen": "cf types",
			},
		});
	});

	it("writes build configuration when an external tool owns the Worker configuration", async ({
		expect,
	}) => {
		await runAutoConfig(
			{
				configured: false,
				projectPath: process.cwd(),
				workerName: "external-config-app",
				framework: new ExternalWorkerConfigFramework({
					id: "static",
					name: "Static",
				}),
				outputDir: "dist",
				packageManager: NpmPackageManager,
			},
			{
				context: createMockContext(),
				skipConfirmations: true,
				runBuild: false,
			}
		);

		expect(existsSync("cloudflare.config.ts")).toBe(false);
		expect(readFileSync("wrangler.config.ts", "utf8")).toContain(
			'"assetsDirectory": "dist"'
		);
	});

	it("fails rather than overwriting existing Wrangler build configuration", async ({
		expect,
	}) => {
		const existingBuildConfig = "export default { minify: true };\n";
		await seed({
			"wrangler.config.ts": existingBuildConfig,
		});

		await expect(
			runAutoConfig(
				{
					configured: false,
					projectPath: process.cwd(),
					workerName: "external-config-app",
					framework: new ExternalWorkerConfigFramework({
						id: "static",
						name: "Static",
					}),
					outputDir: "dist",
					packageManager: NpmPackageManager,
				},
				{
					context: createMockContext(),
					skipConfirmations: true,
					runBuild: false,
				}
			)
		).rejects.toThrow(
			"Cannot generate wrangler.config.ts because the file already exists"
		);
		expect(readFileSync("wrangler.config.ts", "utf8")).toBe(
			existingBuildConfig
		);
	});
});
