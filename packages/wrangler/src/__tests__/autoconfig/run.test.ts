import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import * as cliPackages from "@cloudflare/cli/packages";
import {
	FatalError,
	readFileSync,
	getTodaysCompatDate,
} from "@cloudflare/workers-utils";
import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import * as details from "../../autoconfig/details";
import { Astro } from "../../autoconfig/frameworks/astro";
import { Static } from "../../autoconfig/frameworks/static";
import { getInstalledPackageVersion } from "../../autoconfig/frameworks/utils/packages";
import * as run from "../../autoconfig/run";
import * as format from "../../deployment-bundle/guess-worker-format";
import { clearOutputFilePath } from "../../output";
import { NpmPackageManager } from "../../package-manager";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import {
	clearDialogs,
	mockConfirm,
	mockPrompt,
	mockSelect,
} from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { writeWorkerSource } from "../helpers/write-worker-source";
import type { Framework } from "../../autoconfig/frameworks";
import type { ExpectStatic } from "vitest";
import type { MockInstance } from "vitest";

vi.mock("../../package-manager", () => ({
	getPackageManager() {
		return {
			type: "npm",
			npx: "npx",
			dlx: ["npx"],
		};
	},
	NpmPackageManager: {
		type: "npm",
		npx: "npx",
		dlx: ["npx"],
	},
}));

vi.mock("../../autoconfig/frameworks/utils/packages");

vi.mock("../deploy/deploy", async (importOriginal) => ({
	...(await importOriginal()),
	default: () => {
		// In unit tests of autoconfig we only care about the configuration aspect, so bail before any actual deployment happens
		throw new FatalError("Bailing early in tests");
	},
}));

async function runDeploy(expect: ExpectStatic, withArgs: string = "") {
	// Expect "Bailing early in tests" to be thrown
	await expect(runWrangler(`deploy ${withArgs}`)).rejects.toThrowError();
}

// We don't care about module/service worker detection in the autoconfig tests,
// and mocking it out speeds up the tests by removing an esbuild invocation
vi.spyOn(format, "guessWorkerFormat").mockImplementation(() =>
	Promise.resolve({
		format: "modules",
		exports: [],
	})
);

describe("autoconfig (deploy)", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();

	beforeEach(() => {
		setIsTTY(true);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		clearDialogs();
		clearOutputFilePath();
	});

	it("should not check for autoconfig when `deploy` is run with `--x-autoconfig=false`", async ({
		expect,
	}) => {
		writeWorkerSource();
		writeWranglerConfig({ main: "index.js" });
		const getDetailsSpy = vi.spyOn(details, "getDetailsForAutoConfig");
		await runDeploy(expect, `--x-autoconfig=false`);

		expect(getDetailsSpy).not.toHaveBeenCalled();
	});

	it("should check for autoconfig with flag", async ({ expect }) => {
		const getDetailsSpy = vi.spyOn(details, "getDetailsForAutoConfig");

		await runDeploy(expect, "--x-autoconfig");

		expect(getDetailsSpy).toHaveBeenCalled();
	});

	it("should run autoconfig if project is not configured", async ({
		expect,
	}) => {
		const getDetailsSpy = vi
			.spyOn(details, "getDetailsForAutoConfig")
			.mockImplementationOnce(() =>
				Promise.resolve({
					configured: false,
					projectPath: process.cwd(),
					workerName: "my-worker",
					framework: new Static({ id: "static", name: "Static" }),
					outputDir: "./public",
					packageManager: NpmPackageManager,
				})
			);
		const runSpy = vi.spyOn(run, "runAutoConfig");

		await runDeploy(expect, "--x-autoconfig");

		expect(getDetailsSpy).toHaveBeenCalled();
		expect(runSpy).toHaveBeenCalled();
	});

	it("should not run autoconfig if project is already configured", async ({
		expect,
	}) => {
		const getDetailsSpy = vi
			.spyOn(details, "getDetailsForAutoConfig")
			.mockImplementationOnce(() =>
				Promise.resolve({
					configured: true,
					projectPath: process.cwd(),
					workerName: "my-worker",
					packageManager: NpmPackageManager,
				})
			);
		const runSpy = vi.spyOn(run, "runAutoConfig");

		await runDeploy(expect, "--x-autoconfig");

		expect(getDetailsSpy).toHaveBeenCalled();
		expect(runSpy).not.toHaveBeenCalled();
	});

	it("should warn and prompt when Pages project is detected", async ({
		expect,
	}) => {
		vi.spyOn(details, "getDetailsForAutoConfig").mockImplementationOnce(() =>
			Promise.resolve({
				configured: false,
				projectPath: process.cwd(),
				workerName: "my-worker",
				framework: {
					id: "cloudflare-pages",
					name: "Cloudflare Pages",
					configure: async () => ({ wranglerConfig: {} }),
					isConfigured: () => false,
				} as unknown as Framework,
				outputDir: "public",
				packageManager: NpmPackageManager,
			})
		);
		const runSpy = vi.spyOn(run, "runAutoConfig");

		// User declines to proceed
		mockConfirm({
			text: "Are you sure that you want to proceed?",
			result: false,
		});

		// Should not throw - just return early
		await runWrangler("deploy --x-autoconfig");

		// Should show warning about Pages project
		expect(std.warn).toContain(
			"It seems that you have run `wrangler deploy` on a Pages project"
		);

		// Should NOT run autoconfig since it's a Pages project
		expect(runSpy).not.toHaveBeenCalled();
	});

	describe("runAutoConfig()", () => {
		let installSpy: MockInstance;
		beforeEach(() => {
			installSpy = vi
				.spyOn(cliPackages, "installWrangler")
				.mockImplementation(async () => {});
		});

		it("happy path", async ({ expect }) => {
			await writeFile(
				"package.json",
				JSON.stringify({
					name: "project-name",
				})
			);
			mockConfirm({
				text: "Do you want to modify these settings?",
				result: false,
			});
			mockConfirm({
				text: "Proceed with setup?",
				result: true,
			});
			await writeFile(".gitignore", "node_modules\n");
			const configureSpy = vi.fn(
				async ({ outputDir }) =>
					({
						wranglerConfig: {
							assets: { directory: outputDir },
						},
					}) satisfies ReturnType<Framework["configure"]>
			);
			await run.runAutoConfig(
				{
					projectPath: process.cwd(),
					buildCommand: "echo 'built' > build.txt",
					configured: false,
					workerName: "my-worker",
					framework: {
						// "static" is used here because this test exercises the overall runAutoConfig
						// flow, not framework-specific logic. Note: Using "static" avoids hitting the
						// getFrameworkPackageInfo assert for unknown framework ids.
						id: "static",
						name: "Static",
						configure: configureSpy,
						isConfigured: () => false,
					} as unknown as Framework,
					outputDir: "dist",
					packageJson: {
						dependencies: {
							astro: "5",
						},
					},
					packageManager: NpmPackageManager,
				},
				{ enableWranglerInstallation: true }
			);

			expect(std.out.replaceAll(getTodaysCompatDate(), "<current-date>"))
				.toMatchInlineSnapshot(`
				"
				Detected Project Settings:
				 - Worker Name: my-worker
				 - Framework: Static
				 - Build Command: echo 'built' > build.txt
				 - Output Directory: dist


				📦 Install packages:
				 - wrangler (devDependency)

				📝 Update package.json scripts:
				 - "deploy": "echo 'built' > build.txt && wrangler deploy"
				 - "preview": "echo 'built' > build.txt && wrangler dev"

				📄 Create wrangler.jsonc:
				  {
				    "$schema": "node_modules/wrangler/config-schema.json",
				    "name": "my-worker",
				    "compatibility_date": "<current-date>",
				    "observability": {
				      "enabled": true
				    },
				    "assets": {
				      "directory": "dist"
				    },
				    "compatibility_flags": [
				      "nodejs_compat"
				    ]
				  }

				🛠️  Configuring project for Static

				[build] Running: echo 'built' > build.txt"
			`);

			expect(
				readFileSync("wrangler.jsonc").replaceAll(
					getTodaysCompatDate(),
					"<current-date>"
				)
			).toMatchInlineSnapshot(`
				"{
				  "$schema": "node_modules/wrangler/config-schema.json",
				  "name": "my-worker",
				  "compatibility_date": "<current-date>",
				  "observability": {
				    "enabled": true
				  },
				  "assets": {
				    "directory": "dist"
				  },
				  "compatibility_flags": [
				    "nodejs_compat"
				  ]
				}
				"
			`);

			expect(readFileSync(".gitignore")).toMatchInlineSnapshot(`
				"node_modules

				# wrangler files
				.wrangler
				.dev.vars*
				!.dev.vars.example
				.env*
				!.env.example
				"
			`);

			// Wrangler should have been installed
			expect(installSpy).toHaveBeenCalled();

			// The framework's configuration command should have been run
			expect(configureSpy).toHaveBeenCalled();

			// The framework's build command should have been run
			expect(readFileSync("build.txt")).toContain("built");

			// outputDir !== projectPath, so there's no need for an assets ignore file
			expect(existsSync(".assetsignore")).toBeFalsy();
		});

		it("new gitignore should not have leading empty lines", async ({
			expect,
		}) => {
			// Create a .git directory so gitignore will be created
			await mkdir(".git");

			mockConfirm({
				text: "Do you want to modify these settings?",
				result: false,
			});
			mockConfirm({
				text: "Proceed with setup?",
				result: true,
			});

			await run.runAutoConfig({
				projectPath: process.cwd(),
				workerName: "my-worker",
				configured: false,
				outputDir: "dist",
				framework: new Static({ id: "static", name: "Static" }),
				packageManager: NpmPackageManager,
			});

			expect(readFileSync(".gitignore")).toMatchInlineSnapshot(`
				"# wrangler files
				.wrangler
				.dev.vars*
				!.dev.vars.example
				.env*
				!.env.example
				"
			`);
		});

		it("pre-existing gitignore with trailing newline gets one empty separator line", async ({
			expect,
		}) => {
			// Create gitignore with content ending in newline
			await writeFile(".gitignore", "node_modules\n");
			mockConfirm({
				text: "Do you want to modify these settings?",
				result: false,
			});
			mockConfirm({
				text: "Proceed with setup?",
				result: true,
			});

			await run.runAutoConfig({
				projectPath: process.cwd(),
				workerName: "my-worker",
				configured: false,
				outputDir: "dist",
				framework: new Static({ id: "static", name: "Static" }),
				packageManager: NpmPackageManager,
			});

			// When gitignore pre-existed with trailing newline, one empty line is added as separator
			expect(readFileSync(".gitignore")).toMatchInlineSnapshot(`
				"node_modules

				# wrangler files
				.wrangler
				.dev.vars*
				!.dev.vars.example
				.env*
				!.env.example
				"
			`);
		});

		it("allows users to edit the auto-detected settings", async ({
			expect,
		}) => {
			mockConfirm({
				text: "Do you want to modify these settings?",
				result: true,
			});
			mockPrompt({
				text: "What do you want to name your Worker?",
				result: "edited-worker-name",
			});
			mockSelect({
				text: "What framework is your application using?",
				result: "static",
			});
			mockPrompt({
				text: "What directory contains your applications' output/asset files?",
				result: "dist",
			});
			mockConfirm({
				text: "Proceed with setup?",
				result: true,
			});
			await run.runAutoConfig({
				projectPath: process.cwd(),
				configured: false,
				framework: new Static({ id: "static", name: "Static" }),
				workerName: "my-worker",
				outputDir: "dist",
				packageManager: NpmPackageManager,
			});

			expect(std.out.replaceAll(getTodaysCompatDate(), "<current-date>"))
				.toMatchInlineSnapshot(`
				"
				Detected Project Settings:
				 - Worker Name: my-worker
				 - Framework: Static
				 - Output Directory: dist


				Updated Project Settings:
				 - Worker Name: edited-worker-name
				 - Framework: Static
				 - Output Directory: dist


				📄 Create wrangler.jsonc:
				  {
				    "$schema": "node_modules/wrangler/config-schema.json",
				    "name": "edited-worker-name",
				    "compatibility_date": "<current-date>",
				    "observability": {
				      "enabled": true
				    },
				    "assets": {
				      "directory": "dist"
				    },
				    "compatibility_flags": [
				      "nodejs_compat"
				    ]
				  }
				"
			`);

			expect(
				readFileSync("wrangler.jsonc").replaceAll(
					getTodaysCompatDate(),
					"<current-date>"
				)
			).toMatchInlineSnapshot(`
				"{
				  "$schema": "node_modules/wrangler/config-schema.json",
				  "name": "edited-worker-name",
				  "compatibility_date": "<current-date>",
				  "observability": {
				    "enabled": true
				  },
				  "assets": {
				    "directory": "dist"
				  },
				  "compatibility_flags": [
				    "nodejs_compat"
				  ]
				}
				"
			`);
		});

		it(".assetsignore should contain Wrangler files if outputDir === projectPath", async ({
			expect,
		}) => {
			mockConfirm({
				text: "Do you want to modify these settings?",
				result: false,
			});
			mockConfirm({
				text: "Proceed with setup?",
				result: true,
			});

			await run.runAutoConfig({
				projectPath: process.cwd(),
				workerName: "my-worker",
				configured: false,
				outputDir: process.cwd(),
				framework: new Static({ id: "static", name: "Static" }),
				packageManager: NpmPackageManager,
			});

			expect(readFileSync(".assetsignore")).toMatchInlineSnapshot(`
				"# wrangler files
				.wrangler
				.dev.vars*
				!.dev.vars.example
				.env*
				!.env.example
				"
			`);
		});

		it("pre-existing assetsignore with trailing newline gets one empty separator line", async ({
			expect,
		}) => {
			await writeFile(".assetsignore", "*.bak\n");
			mockConfirm({
				text: "Do you want to modify these settings?",
				result: false,
			});
			mockConfirm({
				text: "Proceed with setup?",
				result: true,
			});

			await run.runAutoConfig({
				projectPath: process.cwd(),
				workerName: "my-worker",
				configured: false,
				outputDir: process.cwd(),
				framework: new Static({ id: "static", name: "Static" }),
				packageManager: NpmPackageManager,
			});

			expect(readFileSync(".assetsignore")).toMatchInlineSnapshot(`
				"*.bak

				# wrangler files
				.wrangler
				.dev.vars*
				!.dev.vars.example
				.env*
				!.env.example
				"
			`);
		});

		it("errors if no output directory is specified in the autoconfig details", async ({
			expect,
		}) => {
			mockConfirm({
				text: "Do you want to modify these settings?",
				result: false,
			});

			await expect(
				run.runAutoConfig({
					projectPath: process.cwd(),
					configured: false,
					framework: new Static({ id: "static", name: "Static" }),
					workerName: "my-worker",
					outputDir: "",
					packageManager: NpmPackageManager,
				})
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[AssertionError: The Output Directory is unexpectedly missing]`
			);
		});

		it("errors with Pages-specific message when framework is cf-pages", async ({
			expect,
		}) => {
			mockConfirm({
				text: "Do you want to modify these settings?",
				result: false,
			});

			await expect(
				run.runAutoConfig({
					projectPath: process.cwd(),
					configured: false,
					framework: {
						id: "cloudflare-pages",
						name: "Cloudflare Pages",
						configure: async () => ({ wranglerConfig: {} }),
						isConfigured: () => false,
					} as unknown as Framework,
					workerName: "my-worker",
					outputDir: "dist",
					packageManager: NpmPackageManager,
				})
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: The target project seems to be using Cloudflare Pages. Automatically migrating from a Pages project to Workers is not yet supported.]`
			);
		});

		it("errors with generic message when unsupported framework is not cf-pages", async ({
			expect,
		}) => {
			mockConfirm({
				text: "Do you want to modify these settings?",
				result: false,
			});

			await expect(
				run.runAutoConfig({
					projectPath: process.cwd(),
					configured: false,
					framework: {
						id: "hono",
						name: "Hono",
						configure: async () => ({ wranglerConfig: {} }),
						isConfigured: () => false,
					} as unknown as Framework,
					workerName: "my-worker",
					outputDir: "dist",
					packageManager: NpmPackageManager,
				})
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: The detected framework ("Hono") cannot be automatically configured.]`
			);
		});

		describe("nodejs_compat compatibility flag", () => {
			it("should add nodejs_compat when framework specifies no compatibility flags", async ({
				expect,
			}) => {
				mockConfirm({
					text: "Do you want to modify these settings?",
					result: false,
				});
				mockConfirm({
					text: "Proceed with setup?",
					result: true,
				});

				await run.runAutoConfig({
					projectPath: process.cwd(),
					workerName: "my-worker",
					configured: false,
					outputDir: "dist",
					framework: {
						// "static" is used here because this test only exercises compatibility flag
						// merging behaviour. Note: Using "static" avoids the getFrameworkPackageInfo assert
						// for unknown framework ids while keeping the test focused on its intent.
						id: "static",
						name: "Static",
						configure: async () => ({
							wranglerConfig: {
								// No compatibility_flags specified
								assets: { directory: "dist" },
							},
						}),
						isConfigured: () => false,
					} as unknown as Framework,
					packageManager: NpmPackageManager,
				});

				const wranglerConfig = JSON.parse(readFileSync("wrangler.jsonc"));
				expect(wranglerConfig.compatibility_flags).toEqual(["nodejs_compat"]);
			});

			it("should preserve other compatibility flags while adding nodejs_compat", async ({
				expect,
			}) => {
				mockConfirm({
					text: "Do you want to modify these settings?",
					result: false,
				});
				mockConfirm({
					text: "Proceed with setup?",
					result: true,
				});

				await run.runAutoConfig({
					projectPath: process.cwd(),
					workerName: "my-worker",
					configured: false,
					outputDir: "dist",
					framework: {
						// "static" is used here because this test only exercises compatibility flag
						// merging behaviour. Using "static" avoids the getFrameworkPackageInfo assert
						// for unknown framework ids while keeping the test focused on its intent.
						id: "static",
						name: "Static",
						configure: async () => ({
							wranglerConfig: {
								compatibility_flags: ["global_fetch_strictly_public"],
								assets: { directory: "dist" },
							},
						}),
						isConfigured: () => false,
					} as unknown as Framework,
					packageManager: NpmPackageManager,
				});

				const wranglerConfig = JSON.parse(readFileSync("wrangler.jsonc"));
				expect(wranglerConfig.compatibility_flags).toEqual([
					"global_fetch_strictly_public",
					"nodejs_compat",
				]);
			});

			it("should not duplicate nodejs_compat if already present", async ({
				expect,
			}) => {
				mockConfirm({
					text: "Do you want to modify these settings?",
					result: false,
				});
				mockConfirm({
					text: "Proceed with setup?",
					result: true,
				});

				await run.runAutoConfig({
					projectPath: process.cwd(),
					workerName: "my-worker",
					configured: false,
					outputDir: "dist",
					framework: {
						// "static" is used here because this test only exercises compatibility flag
						// merging behaviour. Using "static" avoids the getFrameworkPackageInfo assert
						// for unknown framework ids while keeping the test focused on its intent.
						id: "static",
						name: "Static",
						configure: async () => ({
							wranglerConfig: {
								compatibility_flags: ["nodejs_compat"],
								assets: { directory: "dist" },
							},
						}),
						isConfigured: () => false,
					} as unknown as Framework,
					packageManager: NpmPackageManager,
				});

				const wranglerConfig = JSON.parse(readFileSync("wrangler.jsonc"));
				expect(wranglerConfig.compatibility_flags).toEqual(["nodejs_compat"]);
			});

			it("should replace nodejs_als with nodejs_compat", async ({ expect }) => {
				mockConfirm({
					text: "Do you want to modify these settings?",
					result: false,
				});
				mockConfirm({
					text: "Proceed with setup?",
					result: true,
				});

				await run.runAutoConfig({
					projectPath: process.cwd(),
					workerName: "my-worker",
					configured: false,
					outputDir: "dist",
					framework: {
						id: "static",
						name: "Nodejs Als Framework",
						configure: async () => ({
							wranglerConfig: {
								compatibility_flags: ["nodejs_als", "some_other_flag"],
								assets: { directory: "dist" },
							},
						}),
						isConfigured: () => false,
					} as unknown as Framework,
					packageManager: NpmPackageManager,
				});

				const wranglerConfig = JSON.parse(readFileSync("wrangler.jsonc"));
				// nodejs_als should be removed, nodejs_compat should be added, some_other_flag preserved
				expect(wranglerConfig.compatibility_flags).toEqual([
					"some_other_flag",
					"nodejs_compat",
				]);
				expect(wranglerConfig.compatibility_flags).not.toContain("nodejs_als");
			});
		});

		it("validateFrameworkVersion is called before configure for a supported framework", async ({
			expect,
		}) => {
			mockConfirm({
				text: "Do you want to modify these settings?",
				result: false,
			});
			mockConfirm({
				text: "Proceed with setup?",
				result: true,
			});

			// Mock getInstalledPackageVersion to return a valid version so that
			// validateFrameworkVersion does not throw
			vi.mocked(getInstalledPackageVersion).mockReturnValue("5.0.0");

			const framework = new Astro({ id: "astro", name: "Astro" });

			const callOrder: string[] = [];
			vi.spyOn(framework, "validateFrameworkVersion").mockImplementation(() => {
				callOrder.push("validateFrameworkVersion");
			});
			vi.spyOn(framework, "configure").mockImplementation(async () => {
				callOrder.push("configure");
				return { wranglerConfig: { assets: { directory: "dist" } } };
			});

			await run.runAutoConfig({
				projectPath: process.cwd(),
				workerName: "my-worker",
				configured: false,
				outputDir: "dist",
				framework,
				packageManager: NpmPackageManager,
			});

			// configure is called twice: once as a dry-run (to build the summary) and
			// once for real. validateFrameworkVersion must precede both.
			expect(callOrder).toEqual([
				"validateFrameworkVersion",
				"configure",
				"configure",
			]);
		});
	});
});
