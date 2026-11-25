import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as cliPackages from "@cloudflare/cli-shared-helpers/packages";
import { loadAndParseConfig } from "@cloudflare/config";
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

	it("creates loadable cf config in a bare project without installing cf", async ({
		expect,
	}) => {
		await seed({ "index.html": "static site", ".env": "SECRET=secret" });
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
			});
			vi.spyOn(Vite.prototype, "configure").mockImplementation(
				async ({ dryRun }) => {
					if (!dryRun && installTool) {
						await seed({
							"node_modules/vite/package.json": JSON.stringify({
								version: "8.1.0",
								bin: { vite: "cli.js" },
							}),
							"node_modules/vite/cli.js": "",
						});
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
				type: "module",
			});
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

	it("creates new configuration and cf scripts by default", async ({
		expect,
	}) => {
		const packageJson = {
			name: "my-static-app",
			type: "module",
			scripts: {
				build: "generate && vite build",
				dev: "node start.cjs",
				preview: "vite preview",
			},
		};
		await seed({
			"package.json": JSON.stringify(packageJson),
			"public/index.html": "<h1>Hello World</h1>",
		});
		const context = createMockContext();

		const summary = await runAutoConfig(
			{
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
			},
			{
				context,
				skipConfirmations: true,
				enableTargetCliInstallation: false,
			}
		);

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
		expect(JSON.parse(readFileSync("package.json", "utf8"))).toMatchObject({
			type: "module",
			scripts: {
				build: "generate && vite build",
				deploy: "cf deploy",
				dev: "node start.cjs",
				preview: "vite preview",
			},
		});
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

	it("installs the Vite runner when missing and generates a Worker tsconfig", async ({
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
			}),
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
					scripts: { build: "vite build" },
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

		expect(summary.scripts).toEqual({ dev: "cf dev", deploy: "cf deploy" });
		expect(readFileSync("cloudflare.config.ts", "utf8")).toBe(config);
		expect(readFileSync("tsconfig.json", "utf8")).toBe(tsconfig);
		expect(JSON.parse(readFileSync("package.json", "utf8"))).toMatchObject({
			scripts: { build: "vite build", dev: "cf dev" },
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
