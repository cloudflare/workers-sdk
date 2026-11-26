import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import * as cliPackages from "@cloudflare/cli-shared-helpers/packages";
import { loadAndParseConfig, loadConfig } from "@cloudflare/config";
import {
	NpmPackageManager,
	PnpmPackageManager,
} from "@cloudflare/workers-utils";
import {
	mockConsoleMethods,
	runInTempDir,
	seed,
} from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { getDetailsForAutoConfig } from "../src/details";
import { getFrameworkClassInstance } from "../src/frameworks";
import { Framework } from "../src/frameworks/framework-class";
import { Static } from "../src/frameworks/static";
import { Vite } from "../src/frameworks/vite";
import { runAutoConfig } from "../src/run";
import { createMockContext } from "./helpers/mock-context";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "../src/frameworks/framework-class";

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

class OwnAssetsDirectoryFramework extends Framework {
	configure(): ConfigurationResults {
		return {
			buildTool: "wrangler",
			workerConfig: { entrypoint: "./.output/server/index.mjs" },
			buildConfig: { assetsDirectory: "./.output/public/" },
		};
	}
}

class BuildCommandOverrideFramework extends Static {
	configure(options: ConfigurationOptions): ConfigurationResults {
		return {
			...super.configure(options),
			buildCommandOverride: "npx framework build",
		};
	}
}

describe("runAutoConfig()", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	beforeEach(() => {
		vi.spyOn(cliPackages, "installPackages").mockResolvedValue();
		vi.spyOn(cliPackages, "installWrangler").mockResolvedValue();
	});

	it("creates loadable configs without changing how existing CommonJS scripts run", async ({
		expect,
	}) => {
		await seed({
			"index.html": "static site",
			".env": "SECRET=secret",
			"legacy.js":
				'module.exports = require("node:path").basename(__filename);',
			"node_modules/wrangler/package.json": JSON.stringify({
				exports: { "./experimental-config": "./experimental-config.mjs" },
			}),
			"node_modules/wrangler/experimental-config.mjs":
				"export function defineWranglerConfig(config) { return config; }",
		});
		const context = createMockContext();
		const details = await getDetailsForAutoConfig({
			projectPath: process.cwd(),
			outputDir: ".",
			context,
		});

		await runAutoConfig(details, {
			context,
			skipConfirmations: true,
			enableTargetCliInstallation: false,
			runBuild: false,
		});

		const { result } = await loadAndParseConfig(
			join(process.cwd(), "cloudflare.config.ts"),
			{ isPreview: false, mode: undefined }
		);
		expect(result.success).toBe(true);
		const { config } = await loadConfig(
			join(process.cwd(), "wrangler.config.ts")
		);
		expect(config).toEqual({ assetsDirectory: "." });
		const requireFromProject = createRequire(
			join(process.cwd(), "package.json")
		);
		expect(requireFromProject("./legacy.js")).toBe("legacy.js");
		expect(cliPackages.installPackages).toHaveBeenCalledWith(
			"npm",
			["typescript"],
			expect.objectContaining({ cwd: process.cwd() })
		);
		expect(existsSync("node_modules/cf")).toBe(false);
		expect(readFileSync(".assetsignore", "utf8")).toContain(".env*");
	});

	it.for([
		{ installTool: true, runBuild: true },
		{ installTool: false, runBuild: true },
		{ installTool: false, runBuild: false },
	])(
		"checks installed tools after setup only when building (installTool=$installTool, runBuild=$runBuild)",
		async ({ installTool, runBuild }, { expect }) => {
			await seed({
				"package.json": JSON.stringify({
					name: "vite-app",
					devDependencies: { vite: "8.1.0", "@cloudflare/vite-plugin": "beta" },
				}),
				"vite.config.ts": "export default { plugins: [] };",
				"node_modules/@cloudflare/vite-plugin/package.json": JSON.stringify({
					version: "2.0.0-beta.v.13",
				}),
				"node_modules/vite/package.json": JSON.stringify({
					name: "vite",
					version: "8.1.0",
					bin: { vite: "cli.js" },
				}),
			});
			vi.spyOn(Vite.prototype, "configure").mockImplementation(
				async ({ dryRun }) => {
					if (!dryRun && installTool) {
						await seed({ "node_modules/vite/cli.js": "" });
					}
					return { buildTool: "vite", workerConfig: {} };
				}
			);
			const context = createMockContext();
			const details = await getDetailsForAutoConfig({ context });
			expect(details.commandError?.code).toBe("vite-tool-not-installed");
			const setup = runAutoConfig(details, {
				context,
				skipConfirmations: true,
				enableTargetCliInstallation: false,
				runBuild,
			});
			if (runBuild && !installTool) {
				await expect(setup).rejects.toThrow(
					"project's vite executable could not be found"
				);
			} else {
				await expect(setup).resolves.toMatchObject({
					buildCommand: "vite build",
				});
			}
			expect(context.runCommand).toHaveBeenCalledTimes(
				runBuild && installTool ? 1 : 0
			);
		}
	);

	it("updates the application manifest, not its enclosing workspace", async ({
		expect,
	}) => {
		const rootManifest = JSON.stringify({
			name: "workspace-root",
			packageManager: "pnpm@10.0.0",
		});
		await seed({
			"package.json": rootManifest,
			"pnpm-workspace.yaml": "packages: ['packages/*']\n",
			"pnpm-lock.yaml": "",
			"packages/app/package.json": JSON.stringify({ name: "static-app" }),
			"packages/app/public/index.html": "<h1>Application</h1>",
		});
		const context = createMockContext();
		const projectPath = join(process.cwd(), "packages/app");
		const details = await getDetailsForAutoConfig({ projectPath, context });
		expect(details.packageManager.type).toBe("pnpm");

		await runAutoConfig(details, {
			context,
			skipConfirmations: true,
			enableTargetCliInstallation: false,
			runBuild: false,
		});

		expect(readFileSync("package.json", "utf8")).toBe(rootManifest);
		expect(cliPackages.installPackages).toHaveBeenCalledWith(
			"pnpm",
			["typescript"],
			{
				cwd: projectPath,
				dev: true,
				isWorkspaceRoot: false,
			}
		);
		expect(cliPackages.installWrangler).toHaveBeenCalledWith(
			"pnpm",
			false,
			projectPath
		);
		expect(
			JSON.parse(readFileSync(join(projectPath, "package.json"), "utf8"))
		).toMatchObject({ name: "static-app", scripts: { deploy: "cf deploy" } });
		expect(existsSync("cloudflare.config.ts")).toBe(false);
		expect(existsSync(join(projectPath, "cloudflare.config.ts"))).toBe(true);
	});

	it("asks before creating and installing tooling for a bare static site", async ({
		expect,
	}) => {
		await seed({ "site/index.html": "<h1>Hello World</h1>" });
		const context = createMockContext();
		const projectPath = join(process.cwd(), "site");
		const packageJsonPath = join(projectPath, "package.json");
		vi.mocked(context.dialogs.confirm)
			.mockResolvedValueOnce(false)
			.mockImplementationOnce(async () => {
				expect(existsSync(packageJsonPath)).toBe(false);
				expect(existsSync(join(projectPath, "tsconfig.json"))).toBe(false);
				expect(cliPackages.installPackages).not.toHaveBeenCalled();
				return true;
			});
		vi.mocked(cliPackages.installPackages).mockImplementation(async () => {
			const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8"));
			expect(manifest).toMatchObject({
				name: "site",
				private: true,
			});
			expect(manifest).not.toHaveProperty("type");
			await writeFile(
				packageJsonPath,
				JSON.stringify({
					...manifest,
					devDependencies: { cf: "^0.8.0", typescript: "^6.0.0" },
				})
			);
		});
		const details = await getDetailsForAutoConfig({
			projectPath,
			outputDir: ".",
			context,
		});
		const summary = await runAutoConfig(details, { context });

		expect(context.dialogs.confirm).toHaveBeenLastCalledWith(
			"Proceed with setup and create package.json and tsconfig.json?",
			{ defaultValue: false, fallbackValue: true }
		);
		expect(cliPackages.installPackages).toHaveBeenCalledWith(
			"npm",
			["cf@latest", "typescript"],
			{
				cwd: projectPath,
				dev: true,
				isWorkspaceRoot: false,
			}
		);
		expect(cliPackages.installWrangler).toHaveBeenCalledWith(
			"npm",
			false,
			projectPath
		);
		expect(summary.scripts).toEqual({
			dev: "cf dev",
			build: "cf build",
			deploy: "cf deploy",
		});
		expect(JSON.parse(readFileSync(packageJsonPath, "utf8"))).toMatchObject({
			scripts: summary.scripts,
			devDependencies: { cf: "^0.8.0", typescript: "^6.0.0" },
		});
		expect(
			JSON.parse(readFileSync(join(projectPath, "tsconfig.json"), "utf8"))
		).toMatchObject({
			compilerOptions: {
				module: "preserve",
				moduleResolution: "bundler",
				noEmit: true,
			},
			include: ["**/*"],
		});
		expect(
			readFileSync(join(projectPath, ".gitignore"), "utf8").split("\n")
		).toEqual(expect.arrayContaining([".cloudflare/", "node_modules/"]));
		expect(existsSync(join(projectPath, "cloudflare.config.ts"))).toBe(true);
		expect(existsSync("package.json")).toBe(false);

		const configured = await getDetailsForAutoConfig({ projectPath, context });
		expect(configured).toMatchObject({ configured: true });
		expect(configured.buildCommand).toBeUndefined();
		expect(configured.devCommand).toBeUndefined();
		expect(context.runCommand).not.toHaveBeenCalled();
	});

	it("leaves the project unchanged when the user declines to add missing files", async ({
		expect,
	}) => {
		const packageJson = JSON.stringify({ name: "static-app" });
		await seed({
			"index.html": "<h1>Hello World</h1>",
			"package.json": packageJson,
		});
		const context = createMockContext();
		vi.mocked(context.dialogs.confirm).mockResolvedValue(false);
		const details = await getDetailsForAutoConfig({ context });

		await expect(runAutoConfig(details, { context })).rejects.toThrow(
			"Setup cancelled"
		);

		expect(context.dialogs.confirm).toHaveBeenLastCalledWith(
			"Proceed with setup and create tsconfig.json?",
			{ defaultValue: false, fallbackValue: true }
		);
		expect(readFileSync("package.json", "utf8")).toBe(packageJson);
		for (const file of [
			"tsconfig.json",
			"cloudflare.config.ts",
			"wrangler.config.ts",
			".gitignore",
			".assetsignore",
		]) {
			expect(existsSync(file)).toBe(false);
		}
		expect(cliPackages.installPackages).not.toHaveBeenCalled();
		expect(cliPackages.installWrangler).not.toHaveBeenCalled();
		expect(context.runCommand).not.toHaveBeenCalled();
	});

	it("creates the missing project files without asking for confirmation in CI", async ({
		expect,
	}) => {
		await seed({ "index.html": "<h1>Hello World</h1>" });
		const context = createMockContext({ isNonInteractiveOrCI: () => true });
		const details = await getDetailsForAutoConfig({ context });

		await runAutoConfig(details, { context });

		expect(context.dialogs.confirm).not.toHaveBeenCalled();
		expect(existsSync("package.json")).toBe(true);
		expect(existsSync("tsconfig.json")).toBe(true);
		expect(existsSync("cloudflare.config.ts")).toBe(true);
		expect(cliPackages.installPackages).toHaveBeenCalled();
	});

	it("previews the missing files without writing or installing anything", async ({
		expect,
	}) => {
		await seed({ "index.html": "<h1>Hello World</h1>" });
		const context = createMockContext();
		const details = await getDetailsForAutoConfig({ context });
		const summary = await runAutoConfig(details, { context, dryRun: true });

		expect(summary.scripts).toEqual({
			dev: "cf dev",
			build: "cf build",
			deploy: "cf deploy",
		});
		expect(std.out).toContain("Create package.json");
		expect(std.out).toContain("Create tsconfig.json");
		expect(context.dialogs.confirm).not.toHaveBeenCalled();
		for (const file of [
			"package.json",
			"tsconfig.json",
			".gitignore",
			"cloudflare.config.ts",
		]) {
			expect(existsSync(file)).toBe(false);
		}
		expect(cliPackages.installPackages).not.toHaveBeenCalled();
		expect(cliPackages.installWrangler).not.toHaveBeenCalled();
	});

	it("does not overwrite a malformed manifest", async ({ expect }) => {
		const packageJson = '{"name":';
		await seed({
			"index.html": "<h1>Hello World</h1>",
			"package.json": packageJson,
		});
		await expect(
			runAutoConfig(
				{
					configured: false,
					projectPath: process.cwd(),
					workerName: "static-app",
					framework: new Static({ id: "static", name: "Static" }),
					outputDir: ".",
					packageManager: NpmPackageManager,
				},
				{ context: createMockContext(), skipConfirmations: true }
			)
		).rejects.toThrow("The existing package.json could not be read");
		expect(readFileSync("package.json", "utf8")).toBe(packageJson);
		expect(existsSync("cloudflare.config.ts")).toBe(false);
		expect(cliPackages.installPackages).not.toHaveBeenCalled();
	});

	it("leaves an explicit CommonJS package untouched instead of writing an unusable config", async ({
		expect,
	}) => {
		const packageJson = JSON.stringify({ name: "my-app", type: "commonjs" });
		await seed({
			"index.html": "<h1>My app</h1>",
			"package.json": packageJson,
		});
		const context = createMockContext();
		const details = await getDetailsForAutoConfig({ context });
		await expect(
			runAutoConfig(details, { context, skipConfirmations: true })
		).rejects.toThrow(
			'Cannot generate cloudflare.config.ts in a package with "type": "commonjs"'
		);
		expect(readFileSync("package.json", "utf8")).toBe(packageJson);
		expect(existsSync("cloudflare.config.ts")).toBe(false);
		expect(existsSync("tsconfig.json")).toBe(false);
		expect(cliPackages.installPackages).not.toHaveBeenCalled();
		expect(cliPackages.installWrangler).not.toHaveBeenCalled();
	});

	it.for([
		{ vitePlus: false, override: false },
		{ vitePlus: true, override: false },
		{ vitePlus: false, override: true },
		{ vitePlus: true, override: true },
	])(
		"preserves custom build commands with Vite+=$vitePlus and override=$override",
		async ({ vitePlus, override }, { expect }) => {
			const buildCommand = "echo 'built' > build.txt";
			const packageJson = {
				name: "static-app",
				devDependencies: vitePlus ? { "vite-plus": "1.4.0" } : {},
			};
			await seed({ "package.json": JSON.stringify(packageJson) });
			const framework = getFrameworkClassInstance("static", "cf");
			vi.spyOn(framework, "configure").mockReturnValue({
				buildTool: "wrangler",
				workerConfig: {},
				buildConfig: { assetsDirectory: "public" },
				...(override && { buildCommandOverride: buildCommand }),
			});
			const summary = await runAutoConfig(
				{
					configured: false,
					projectPath: process.cwd(),
					workerName: "static-app",
					framework,
					outputDir: "public",
					buildCommand: override ? "npm run build" : buildCommand,
					packageManager: NpmPackageManager,
					packageJson,
				},
				{ context: createMockContext(), dryRun: true }
			);
			expect(summary.buildCommand).toBe(buildCommand);
		}
	);

	it.for([
		{ packageManager: NpmPackageManager, vitePlus: true },
		{ packageManager: PnpmPackageManager, vitePlus: true },
		{ packageManager: NpmPackageManager, vitePlus: false },
	])(
		"uses the vinext build override with $packageManager.type and Vite+=$vitePlus",
		async ({ packageManager, vitePlus }, { expect }) => {
			const packageJson = {
				name: "next-app",
				dependencies: { next: "16.1.0" },
				devDependencies: vitePlus ? { "vite-plus": "1.4.0" } : {},
			};
			await seed({
				"package.json": JSON.stringify(packageJson),
				"node_modules/next/package.json": JSON.stringify({
					name: "next",
					version: "16.1.0",
				}),
			});
			const summary = await runAutoConfig(
				{
					configured: false,
					projectPath: process.cwd(),
					workerName: "next-app",
					framework: getFrameworkClassInstance("next", "cf"),
					outputDir: ".next",
					buildCommand: `${packageManager.npx} next build`,
					packageManager,
					packageJson,
				},
				{ context: createMockContext(), dryRun: true }
			);
			expect(summary.buildCommand).toBe(
				vitePlus ? "vp build" : `${packageManager.npx} vite build`
			);
		}
	);

	it("rejects autoconfiguration for an unsupported framework", async ({
		expect,
	}) => {
		await expect(
			runAutoConfig(
				{
					configured: false,
					projectPath: process.cwd(),
					workerName: "hono-app",
					framework: getFrameworkClassInstance("hono", "cf"),
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
			'The detected framework ("Hono") cannot be automatically configured.'
		);
	});

	it("rejects a Wrangler-only framework when passed preconstructed cf details", async ({
		expect,
	}) => {
		await expect(
			runAutoConfig(
				{
					configured: false,
					projectPath: process.cwd(),
					workerName: "qwik-app",
					framework: getFrameworkClassInstance("qwik", "cf"),
					outputDir: "dist",
					packageManager: NpmPackageManager,
				},
				{
					target: "cf",
					context: createMockContext(),
					skipConfirmations: true,
					runBuild: false,
				}
			)
		).rejects.toThrow(
			"cf does not support Qwik projects yet. You can still use Wrangler to develop and deploy this project."
		);
	});

	it("allows selecting a cf-supported framework during confirmation", async ({
		expect,
	}) => {
		const context = createMockContext({
			dialogs: {
				confirm: vi.fn().mockResolvedValue(true),
				prompt: vi
					.fn()
					.mockResolvedValueOnce("static-app")
					.mockResolvedValueOnce("dist"),
				select: vi.fn().mockResolvedValue("static"),
			},
		});

		const summary = await runAutoConfig(
			{
				configured: false,
				projectPath: process.cwd(),
				workerName: "qwik-app",
				framework: getFrameworkClassInstance("qwik", "cf"),
				outputDir: "dist",
				packageManager: NpmPackageManager,
			},
			{
				target: "cf",
				context,
				runBuild: false,
				enableTargetCliInstallation: false,
			}
		);

		expect(summary.frameworkId).toBe("static");
	});

	it("creates configuration without replacing existing package scripts", async ({
		expect,
	}) => {
		const packageJson = {
			name: "my-static-app",
			type: "module",
			scripts: {
				build: "generate && vite build",
				deploy: "node scripts/deploy.cjs",
				dev: "node start.cjs",
				preview: "vite preview",
			},
		};
		await seed({
			"package.json": JSON.stringify(packageJson),
			"public/index.html": "<h1>Hello World</h1>",
		});
		const context = createMockContext();

		const details = {
			configured: false,
			projectPath: process.cwd(),
			workerName: "my-static-app",
			framework: new BuildCommandOverrideFramework({
				id: "static",
				name: "Static",
			}),
			buildCommand: "npm run build",
			outputDir: "public",
			packageJson,
			packageManager: NpmPackageManager,
		} as const;
		const preview = await runAutoConfig(details, { context, dryRun: true });
		expect(preview.scripts).toEqual({});
		expect(std.out).not.toContain("Update package.json scripts:");

		const summary = await runAutoConfig(details, {
			context,
			skipConfirmations: true,
			enableTargetCliInstallation: false,
		});

		expect(summary.workerConfig).toMatchObject({
			name: "my-static-app",
			observability: { enabled: true },
		});
		expect(summary.buildConfig).toEqual({ assetsDirectory: "public" });
		expect(summary.buildCommand).toBe("npx framework build");
		expect(summary.deployCommand).toBe("npx cf deploy");
		expect(summary.versionCommand).toBe("npx cf versions upload");
		expect(readFileSync("cloudflare.config.ts", "utf8")).toContain(
			'import type { CloudflareConfig } from "cf/config";\n\nexport default {\n  worker: {\n    "name": "my-static-app"'
		);
		expect(readFileSync("wrangler.config.ts", "utf8")).toContain(
			'import { defineWranglerConfig } from "wrangler/experimental-config";\n\nexport default defineWranglerConfig({\n  "assetsDirectory": "public"'
		);
		expect(existsSync("wrangler.jsonc")).toBe(false);
		expect(cliPackages.installWrangler).toHaveBeenCalledWith(
			"npm",
			false,
			process.cwd()
		);
		expect(context.runCommand).toHaveBeenCalledWith(
			"npx framework build",
			process.cwd(),
			"[build]"
		);
		expect(summary.scripts).toEqual({});
		expect(readFileSync("package.json", "utf8")).toBe(
			JSON.stringify(packageJson)
		);
	});

	it("installs cf and Wrangler for cf projects", async ({ expect }) => {
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

		expect(cliPackages.installPackages).toHaveBeenCalledWith(
			"npm",
			["cf@latest", "typescript"],
			{
				cwd: process.cwd(),
				dev: true,
				isWorkspaceRoot: false,
			}
		);
		expect(cliPackages.installWrangler).toHaveBeenCalledWith(
			"npm",
			false,
			process.cwd()
		);
	});

	it("does not reinstall existing cf or TypeScript dependencies", async ({
		expect,
	}) => {
		const packageJson = {
			name: "my-static-app",
			devDependencies: { cf: "^0.8.0", typescript: "^6.0.0" },
		};
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

		expect(cliPackages.installPackages).not.toHaveBeenCalled();
	});

	it.for([
		{ declared: false, viteVersion: "8.1.0" },
		{ declared: true, viteVersion: "7.1.12" },
	])(
		"sets up a Vite project without an installed runner (declared=$declared)",
		async ({ declared, viteVersion }, { expect }) => {
			const viteConfig =
				'import { defineConfig } from "vite";\nexport default defineConfig({ plugins: [] });\n';
			const packageJson = {
				name: "vite-app",
				devDependencies: {
					cf: "^0.8.0",
					typescript: "^6.0.0",
					"@cloudflare/vite-plugin": "^2.0.0-rc.0",
					...(declared ? { vite: viteVersion } : {}),
				},
			};
			await seed({
				"package.json": JSON.stringify(packageJson),
				"vite.config.ts": viteConfig,
				"index.html": "<h1>Hello World</h1>",
			});
			const context = createMockContext({
				isNonInteractiveOrCI: () => declared,
			});
			const detected = await getDetailsForAutoConfig({ context });
			const details = declared
				? detected
				: {
						...detected,
						framework: getFrameworkClassInstance("vite", "cf"),
						outputDir: "dist",
						buildCommand: "vite build",
					};
			expect(details.framework).toBeInstanceOf(Vite);
			expect(existsSync("node_modules/vite")).toBe(false);

			await runAutoConfig(details, { context, dryRun: true });
			expect(cliPackages.installPackages).not.toHaveBeenCalled();
			expect(context.logger.log).toHaveBeenCalledWith(
				declared
					? "📦 Install project dependencies"
					: " - vite@^8.0.0 (devDependency)"
			);
			expect(existsSync("cloudflare.config.ts")).toBe(false);
			expect(readFileSync("vite.config.ts", "utf8")).toBe(viteConfig);

			vi.mocked(cliPackages.installPackages).mockImplementationOnce(
				async () => {
					await seed({
						"package.json": JSON.stringify({
							...packageJson,
							devDependencies: {
								...packageJson.devDependencies,
								vite: declared ? viteVersion : "^8.0.0",
							},
						}),
						"node_modules/vite/package.json": JSON.stringify({
							name: "vite",
							version: viteVersion,
							bin: { vite: "cli.js" },
						}),
						"node_modules/vite/cli.js": "",
						"node_modules/@cloudflare/vite-plugin/package.json": JSON.stringify(
							{
								name: "@cloudflare/vite-plugin",
								version: "2.0.0-rc.0",
							}
						),
					});
				}
			);
			vi.mocked(context.dialogs.select).mockResolvedValue("vite");
			vi.mocked(context.dialogs.prompt)
				.mockResolvedValueOnce("vite-app")
				.mockResolvedValueOnce("dist")
				.mockResolvedValueOnce("vite build");
			const summary = await runAutoConfig(detected, { context });

			expect(cliPackages.installPackages).toHaveBeenNthCalledWith(
				1,
				"npm",
				declared ? [] : ["vite@^8.0.0"],
				{ cwd: process.cwd(), dev: true, isWorkspaceRoot: false }
			);
			expect(cliPackages.installPackages).toHaveBeenNthCalledWith(
				2,
				"npm",
				["@cloudflare/vite-plugin@^2.0.0-rc.0"],
				expect.objectContaining({ cwd: process.cwd(), dev: true })
			);
			expect(cliPackages.installWrangler).not.toHaveBeenCalled();
			if (declared) {
				expect(context.dialogs.confirm).not.toHaveBeenCalled();
			} else {
				expect(context.dialogs.select).toHaveBeenCalledOnce();
			}
			expect(context.runCommand).toHaveBeenCalledExactlyOnceWith(
				"vite build",
				process.cwd(),
				"[build]"
			);
			expect(summary.scripts).toEqual({
				build: "cf build",
				deploy: "cf deploy",
				dev: "cf dev",
			});
			expect(existsSync("cloudflare.config.ts")).toBe(true);
			expect(readFileSync("vite.config.ts", "utf8")).toContain(
				"@cloudflare/vite-plugin"
			);
		}
	);

	it.for([
		{
			scenario: "Vite from the workspace",
			workspaceRunner: "vite",
			installCf: false,
			initialInstall: "empty",
		},
		{
			scenario: "Vite+ from the workspace, with cf missing",
			workspaceRunner: "vite-plus",
			installCf: true,
			initialInstall: "empty",
		},
		{
			scenario: "Vite+ from the workspace, with plain Vite already installed",
			workspaceRunner: "vite-plus",
			installCf: true,
			initialInstall: "plain-vite",
		},
		{
			scenario: "Vite+ from the workspace, with a missing vp executable",
			workspaceRunner: "vite-plus",
			installCf: true,
			initialInstall: "missing-vp",
		},
		{
			scenario:
				"Vite+ from the workspace, with vp and its core already installed",
			workspaceRunner: "vite-plus",
			installCf: false,
			initialInstall: "installed-vp",
		},
		{
			scenario: "an enclosing workspace that excludes the app",
			workspaceRunner: undefined,
			installCf: false,
			initialInstall: "empty",
		},
	] as const)(
		"respects runner declarations for $scenario",
		async ({ workspaceRunner, installCf, initialInstall }, { expect }) => {
			const vitePlus = workspaceRunner === "vite-plus";
			const runnerVersion = vitePlus ? "0.2.2" : "7.1.12";
			const rootManifest = JSON.stringify({
				name: "workspace",
				devDependencies: {
					[workspaceRunner ?? "vite"]: runnerVersion,
					...(vitePlus && {
						vite: `npm:@voidzero-dev/vite-plus-core@${runnerVersion}`,
					}),
				},
			});
			const projectPath = join(process.cwd(), "apps/site");
			const manifestPath = join(projectPath, "package.json");
			const projectManifest = { name: "site" };
			const vpManifest = JSON.stringify({
				name: "vite-plus",
				version: runnerVersion,
				bin: { vp: "bin/vp" },
			});
			const runnerModules = `${workspaceRunner ? "" : "apps/site/"}node_modules`;
			const runnerFiles = {
				[`${runnerModules}/vite/package.json`]: JSON.stringify({
					name: vitePlus ? "@voidzero-dev/vite-plus-core" : "vite",
					version: workspaceRunner ? runnerVersion : "8.1.0",
					...(vitePlus
						? { bundledVersions: { vite: "8.1.2" } }
						: { bin: { vite: "cli.js" } }),
				}),
				...(vitePlus
					? {
							"node_modules/vite-plus/package.json": vpManifest,
							"node_modules/vite-plus/bin/vp": "",
						}
					: { [`${runnerModules}/vite/cli.js`]: "" }),
			};
			const installRunner = initialInstall !== "installed-vp";
			await seed({
				"package.json": rootManifest,
				"pnpm-workspace.yaml": `packages: ['${workspaceRunner ? "apps" : "packages"}/*']\n`,
				"pnpm-lock.yaml": "",
				"apps/site/package.json": JSON.stringify(projectManifest),
				"apps/site/tsconfig.json": "{}",
				"apps/site/index.html": "<h1>Hello World</h1>",
				"apps/site/vite.config.ts":
					'import { defineConfig } from "vite"; export default defineConfig({ plugins: [] });',
				...(initialInstall === "installed-vp" && runnerFiles),
				...((initialInstall === "plain-vite" ||
					initialInstall === "missing-vp") && {
					"apps/site/node_modules/vite/package.json": JSON.stringify({
						name: "vite",
						version: "8.0.0",
						bin: { vite: "cli.js" },
					}),
					"apps/site/node_modules/vite/cli.js": "",
				}),
				...(initialInstall === "missing-vp" && {
					"node_modules/vite-plus/package.json": vpManifest,
				}),
			});
			const context = createMockContext();
			const details = await getDetailsForAutoConfig({ projectPath, context });
			const install = vi.mocked(cliPackages.installPackages);
			if (installCf) {
				install.mockResolvedValueOnce();
			}
			if (installRunner) {
				install.mockImplementationOnce(() => seed(runnerFiles));
			}
			vi.mocked(context.dialogs.select).mockResolvedValue("vite");
			vi.mocked(context.dialogs.prompt)
				.mockResolvedValueOnce("site")
				.mockResolvedValueOnce("dist")
				.mockResolvedValueOnce("vite build");

			const summary = await runAutoConfig(details, {
				context,
				enableTargetCliInstallation: installCf,
			});

			const appInstall = {
				cwd: projectPath,
				dev: true,
				isWorkspaceRoot: false,
			};
			const runnerInstall = workspaceRunner
				? ["pnpm", [], { cwd: process.cwd() }]
				: [details.packageManager.type, ["vite@^8.0.0"], appInstall];
			expect(install.mock.calls).toEqual([
				...(installCf ? [["pnpm", ["cf@latest"], appInstall]] : []),
				...(installRunner ? [runnerInstall] : []),
				[
					details.packageManager.type,
					["@cloudflare/vite-plugin@^2.0.0-rc.0"],
					expect.objectContaining(appInstall),
				],
			]);
			expect(context.dialogs.select).toHaveBeenCalledOnce();
			const buildCommand = vitePlus ? "vp build" : "vite build";
			expect(summary.buildCommand).toBe(buildCommand);
			expect(context.runCommand).toHaveBeenCalledExactlyOnceWith(
				buildCommand,
				projectPath,
				"[build]"
			);
			expect(readFileSync("package.json", "utf8")).toBe(rootManifest);
			expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toMatchObject(
				projectManifest
			);
			expect(existsSync(join(projectPath, "cloudflare.config.ts"))).toBe(true);
		}
	);

	it.for([true, false])(
		"previews the workspace install when cf installation is %s",
		async (installCf, { expect }) => {
			await seed({
				"package.json": JSON.stringify({
					name: "workspace",
					devDependencies: { "vite-plus": "0.2.2" },
				}),
				"pnpm-workspace.yaml": "packages: ['apps/*']\n",
				"pnpm-lock.yaml": "",
				"apps/site/package.json": JSON.stringify({
					name: "site",
					devDependencies: { "@cloudflare/vite-plugin": "^2.0.0-rc.0" },
				}),
				"apps/site/tsconfig.json": "{}",
				"apps/site/index.html": "<h1>Hello World</h1>",
			});
			const projectPath = join(process.cwd(), "apps/site");
			const context = createMockContext();
			const details = await getDetailsForAutoConfig({ projectPath, context });
			const { buildCommand } = await runAutoConfig(details, {
				context,
				dryRun: true,
				enableTargetCliInstallation: installCf,
			});

			expect(buildCommand).toBe("vp build");
			expect(context.logger.log).toHaveBeenCalledWith(
				installCf
					? "📦 Install workspace dependencies if Vite tooling is still missing"
					: "📦 Install workspace dependencies"
			);
			expect(cliPackages.installPackages).not.toHaveBeenCalled();
			expect(existsSync(join(projectPath, "cloudflare.config.ts"))).toBe(false);
		}
	);

	it.for([true, false])(
		"rejects an unsupported Vite version before configuring (already installed=%s)",
		async (installed, { expect }) => {
			const packageJson = JSON.stringify({
				devDependencies: { cf: "^0.8.0", vite: "6.3.5" },
			});
			await seed({
				"package.json": packageJson,
				"tsconfig.json": "{}",
				"index.html": "<h1>Hello World</h1>",
			});
			const runnerFiles = {
				"node_modules/vite/package.json": JSON.stringify({
					name: "vite",
					version: "6.3.5",
					bin: { vite: "cli.js" },
				}),
				"node_modules/vite/cli.js": "",
			};
			if (installed) {
				await seed(runnerFiles);
			} else {
				vi.mocked(cliPackages.installPackages).mockImplementationOnce(() =>
					seed(runnerFiles)
				);
			}
			const context = createMockContext();
			const details = await getDetailsForAutoConfig({ context });
			expect(details.framework).toBeInstanceOf(Vite);

			await expect(
				runAutoConfig(details, { context, skipConfirmations: true })
			).rejects.toThrow(
				'The version of Vite used in the project ("6.3.5") cannot be automatically configured.'
			);
			expect(cliPackages.installPackages).toHaveBeenCalledTimes(
				installed ? 0 : 1
			);
			expect(context.runCommand).not.toHaveBeenCalled();
			expect(existsSync("vite.config.mts")).toBe(false);
			expect(existsSync("cloudflare.config.ts")).toBe(false);
			expect(readFileSync("package.json", "utf8")).toBe(packageJson);
		}
	);

	it("generates a tsconfig that includes the generated Worker types", async ({
		expect,
	}) => {
		const packageJson = { name: "my-vite-app" };
		await seed({
			"package.json": JSON.stringify(packageJson),
			"dist/index.html": "<h1>Hello World</h1>",
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

		expect(cliPackages.installPackages).toHaveBeenCalledWith(
			"npm",
			["cf@latest", "typescript", "vite@^8.0.0"],
			{
				cwd: process.cwd(),
				dev: true,
				isWorkspaceRoot: false,
			}
		);
		expect(cliPackages.installWrangler).not.toHaveBeenCalled();
		expect(JSON.parse(readFileSync("package.json", "utf8"))).toMatchObject({
			scripts: {
				"cf-typegen": "cf workers types",
			},
		});
		expect(JSON.parse(readFileSync("tsconfig.json", "utf8"))).toMatchObject({
			include: ["**/*", ".cloudflare/types"],
		});
	});

	it("configures a Vite app without changing its package module type or replacing Vite", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({
				name: "vite-app",
				devDependencies: { vite: "7.1.12" },
			}),
			"node_modules/vite/package.json": JSON.stringify({
				name: "vite",
				version: "7.1.12",
				bin: { vite: "cli.js" },
			}),
			"node_modules/vite/cli.js": "",
			"index.html": "<h1>Hello World</h1>",
		});
		const context = createMockContext();
		const details = await getDetailsForAutoConfig({ context });
		expect(details.framework?.id).toBe("vite");
		await runAutoConfig(details, {
			context,
			skipConfirmations: true,
			runBuild: false,
		});

		expect(
			vi
				.mocked(cliPackages.installPackages)
				.mock.calls.map(([, packages]) => packages)
		).toEqual([
			["cf@latest", "typescript"],
			["@cloudflare/vite-plugin@^2.0.0-rc.0"],
		]);
		expect(cliPackages.installWrangler).not.toHaveBeenCalled();
		const manifest = JSON.parse(readFileSync("package.json", "utf8"));
		expect(manifest).not.toHaveProperty("type");
		expect(manifest).toMatchObject({
			devDependencies: { vite: "7.1.12" },
			scripts: { dev: "cf dev", build: "cf build" },
		});
		expect(existsSync("tsconfig.json")).toBe(true);
		expect(readFileSync("vite.config.mts", "utf8")).toContain(
			"plugins: [cloudflare()]"
		);
	});

	it("adds the cf-generated types to tsconfig.json", async ({ expect }) => {
		const packageJson = { name: "my-vite-app" };
		await seed({
			"package.json": JSON.stringify(packageJson),
			"tsconfig.json": JSON.stringify({ include: ["src"] }),
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
				enableTargetCliInstallation: false,
			}
		);

		expect(JSON.parse(readFileSync("tsconfig.json", "utf8"))).toEqual({
			include: ["src", ".cloudflare/types"],
		});
	});

	it("lists the tsconfig.json change without writing it in a dry run", async ({
		expect,
	}) => {
		const packageJson = { name: "my-vite-app" };
		const tsconfig = JSON.stringify({ include: ["src"] });
		await seed({
			"package.json": JSON.stringify(packageJson),
			"tsconfig.json": tsconfig,
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
			{ context: createMockContext(), dryRun: true }
		);

		expect(std.out).toContain(
			'📝 Update tsconfig.json:\n - Add ".cloudflare/types" to "include"'
		);
		expect(readFileSync("tsconfig.json", "utf8")).toBe(tsconfig);
	});

	it("keeps the Wrangler typegen command for Wrangler projects", async ({
		expect,
	}) => {
		const packageJson = { name: "my-vite-app" };
		await seed({
			"package.json": JSON.stringify(packageJson),
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
				target: "wrangler",
				context: createMockContext(),
				skipConfirmations: true,
				runBuild: false,
				enableTargetCliInstallation: false,
			}
		);

		expect(JSON.parse(readFileSync("package.json", "utf8"))).toMatchObject({
			scripts: {
				"cf-typegen": "wrangler types",
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
		expect(existsSync("package.json")).toBe(false);
		expect(existsSync("tsconfig.json")).toBe(false);
		expect(readFileSync("wrangler.config.ts", "utf8")).toContain(
			'"assetsDirectory": "dist"'
		);
	});

	it("keeps supporting files and scripts generated by a framework's setup", async ({
		expect,
	}) => {
		const packageJson = { name: "next-app", dependencies: { next: "16.1.0" } };
		await seed({
			"package.json": JSON.stringify(packageJson),
			"node_modules/next/package.json": JSON.stringify({
				name: "next",
				version: "16.1.0",
			}),
		});
		const framework = getFrameworkClassInstance("next", "cf");
		const tsconfig = '{"extends":"./tsconfig.next.json"}\n';
		const config = "export default { worker: { name: 'next-app' } };\n";
		const configure = framework.configure.bind(framework);
		vi.spyOn(framework, "configure").mockImplementation(async (options) => {
			if (options.dryRun) {
				return configure(options);
			}
			await seed({
				"tsconfig.json": tsconfig,
				"cloudflare.config.ts": config,
				"package.json": JSON.stringify({
					...packageJson,
					scripts: { build: "vite build", deploy: "vite build && cf deploy" },
				}),
			});
			return configure({ ...options, dryRun: true });
		});
		const context = createMockContext();
		const summary = await runAutoConfig(
			{
				configured: false,
				projectPath: process.cwd(),
				workerName: "next-app",
				framework,
				outputDir: ".next",
				packageJson,
				packageManager: NpmPackageManager,
			},
			{ context, skipConfirmations: true, runBuild: false }
		);

		expect(summary.scripts).toEqual({ dev: "cf dev" });
		expect(readFileSync("cloudflare.config.ts", "utf8")).toBe(config);
		expect(readFileSync("tsconfig.json", "utf8")).toBe(tsconfig);
		expect(JSON.parse(readFileSync("package.json", "utf8"))).toMatchObject({
			scripts: {
				build: "vite build",
				deploy: "vite build && cf deploy",
				dev: "cf dev",
			},
		});
	});

	it("does not scaffold supporting files for legacy Wrangler projects", async ({
		expect,
	}) => {
		await seed({ "index.html": "<h1>Hello World</h1>" });
		const context = createMockContext();
		const details = await getDetailsForAutoConfig({
			target: "wrangler",
			context,
		});
		await runAutoConfig(details, {
			target: "wrangler",
			context,
			skipConfirmations: true,
		});

		expect(existsSync("wrangler.jsonc")).toBe(true);
		for (const file of [
			"package.json",
			"tsconfig.json",
			".gitignore",
			"cloudflare.config.ts",
		]) {
			expect(existsSync(file)).toBe(false);
		}
		expect(cliPackages.installPackages).not.toHaveBeenCalled();
		expect(cliPackages.installWrangler).not.toHaveBeenCalled();
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

	it("writes a root .assetsignore when the project root is the assets directory", async ({
		expect,
	}) => {
		await seed({ "index.html": "<h1>Hello World</h1>", ".env": "KEY=1" });

		await runAutoConfig(
			{
				configured: false,
				projectPath: process.cwd(),
				workerName: "root-static-app",
				framework: new Static({ id: "static", name: "Static" }),
				outputDir: ".",
				packageManager: NpmPackageManager,
			},
			{
				context: createMockContext(),
				skipConfirmations: true,
				runBuild: false,
			}
		);

		const assetsIgnore = readFileSync(".assetsignore", "utf8");
		for (const entry of [
			".env*",
			".dev.vars*",
			"/functions",
			"node_modules",
			"/package.json",
			"/tsconfig.json",
			"/cloudflare.config.ts",
			"/wrangler.config.ts",
			"/package-lock.json",
			"/.cloudflare",
		]) {
			expect(assetsIgnore.split("\n")).toContain(entry);
		}
	});

	it("does not write a root .assetsignore when the framework configures a different assets directory", async ({
		expect,
	}) => {
		await seed({ "index.html": "<h1>Hello World</h1>" });

		await runAutoConfig(
			{
				configured: false,
				projectPath: process.cwd(),
				workerName: "own-assets-app",
				framework: new OwnAssetsDirectoryFramework({
					id: "static",
					name: "Static",
				}),
				outputDir: ".",
				packageManager: NpmPackageManager,
			},
			{
				context: createMockContext(),
				skipConfirmations: true,
				runBuild: false,
			}
		);

		expect(existsSync(".assetsignore")).toBe(false);
	});
});
