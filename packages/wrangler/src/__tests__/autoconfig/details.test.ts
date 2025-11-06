import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	confirmAutoConfigDetails,
	displayAutoConfigDetails,
} from "../../autoconfig/details";
import * as details from "../../autoconfig/details";
import { clearOutputFilePath } from "../../output";
import { mockConsoleMethods } from "../helpers/mock-console";
import { mockConfirm, mockPrompt } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { runInTempDir } from "../helpers/run-in-tmp";
import { seed } from "../helpers/seed";
import type { Config } from "@cloudflare/workers-utils";

vi.mock("../../package-manager", () => ({
	getPackageManager() {
		return {
			type: "npm",
			npx: "npx",
		};
	},
}));

describe("autoconfig details", () => {
	describe("getDetailsForAutoConfig()", () => {
		runInTempDir();
		const { setIsTTY } = useMockIsTTY();
		mockConsoleMethods();

		beforeEach(() => {
			setIsTTY(true);
		});

		afterEach(() => {
			vi.unstubAllGlobals();
			clearOutputFilePath();
		});

		it("should set configured: true if a configPath exists", async () => {
			await expect(
				details.getDetailsForAutoConfig({
					wranglerConfig: { configPath: "/tmp" } as Config,
				})
			).resolves.toMatchObject({ configured: true });
		});

		// Check that Astro is detected. We don't want to duplicate the tests of @netlify/build-info
		// by exhaustively checking every possible combination
		it("should perform basic framework detection", async () => {
			await writeFile(
				"package.json",
				JSON.stringify({
					dependencies: {
						astro: "5",
					},
				})
			);

			await expect(details.getDetailsForAutoConfig()).resolves.toMatchObject({
				buildCommand: "astro build",
				configured: false,
				outputDir: "dist",
				packageJson: {
					dependencies: {
						astro: "5",
					},
				},
			});
		});

		it("should bail when multiple frameworks are detected", async () => {
			await writeFile(
				"package.json",
				JSON.stringify({
					dependencies: {
						astro: "5",
						gatsby: "5",
					},
				})
			);

			await expect(
				details.getDetailsForAutoConfig()
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Wrangler was unable to automatically configure your project to work with Cloudflare, since multiple frameworks were found: Astro, Gatsby]`
			);
		});

		it("should use npm build instead of framework build if present", async () => {
			await writeFile(
				"package.json",
				JSON.stringify({
					scripts: {
						build: "echo build",
					},
					dependencies: {
						astro: "5",
					},
				})
			);

			await expect(details.getDetailsForAutoConfig()).resolves.toMatchObject({
				buildCommand: "npm run build",
			});
		});

		it("outputDir should be empty if nothing can be detected", async () => {
			await expect(details.getDetailsForAutoConfig()).resolves.toMatchObject({
				outputDir: undefined,
			});
		});

		it("outputDir should be set to cwd if an index.html file exists", async () => {
			await writeFile("index.html", `<h1>Hello World</h1>`);

			await expect(details.getDetailsForAutoConfig()).resolves.toMatchObject({
				outputDir: process.cwd(),
			});
		});

		it("outputDir should find first child directory with an index.html file", async () => {
			await seed({
				"public/index.html": `<h1>Hello World</h1>`,
				"random/index.html": `<h1>Hello World</h1>`,
			});

			await expect(details.getDetailsForAutoConfig()).resolves.toMatchObject({
				outputDir: join(process.cwd(), "public"),
			});
		});

		it("outputDir should prioritize the project directory over its child directories", async () => {
			await seed({
				"index.html": `<h1>Hello World</h1>`,
				"public/index.html": `<h1>Hello World</h1>`,
			});

			await expect(details.getDetailsForAutoConfig()).resolves.toMatchObject({
				outputDir: process.cwd(),
			});
		});

		const workerNamesToTest = [
			{ rawName: "my-project-1", normalizedName: "my-project-1" },
			{
				rawName: "-my-other-project%_",
				normalizedName: "my-other-project",
			},
			{
				rawName: "x".repeat(100),
				normalizedName: "x".repeat(58),
			},
			{
				rawName: "???",
				normalizedName: "my-worker",
			},
		];

		it("should use the directory name as the worker name for a plain static site, normalizing it if needed", async () => {
			for (const {
				rawName: dirname,
				normalizedName: expectedWorkerName,
			} of workerNamesToTest) {
				await seed({
					[`./${dirname}/index.html`]: "<h1>Hello World</h1>",
				});
				await expect(
					details.getDetailsForAutoConfig({
						projectPath: `./${dirname}`,
					})
				).resolves.toMatchObject({
					workerName: expectedWorkerName,
				});
			}
		});

		it("should use the project name from the package.json file when available as the worker name, normalizing it if needed", async () => {
			for (const {
				rawName: projectName,
				normalizedName: expectedWorkerName,
			} of workerNamesToTest) {
				const dirname = `project-${randomUUID()}`;
				await seed({
					[`./${dirname}/package.json`]: JSON.stringify({ name: projectName }),
				});
				await expect(
					details.getDetailsForAutoConfig({
						projectPath: `./${dirname}`,
					})
				).resolves.toMatchObject({
					workerName: expectedWorkerName,
				});
			}
		});
	});

	describe("displayAutoConfigDetails()", () => {
		const std = mockConsoleMethods();

		it("should cleanly handle a case in which only the worker name has been detected", () => {
			displayAutoConfigDetails({
				configured: false,
				projectPath: process.cwd(),
				workerName: "my-project",
			});
			expect(std.out).toMatchInlineSnapshot(
				`
				"
				Auto-detected Project Settings:
				 - Worker Name: my-project
				"
			`
			);
		});

		it("should display all the project settings provided by the details object", () => {
			displayAutoConfigDetails({
				configured: false,
				projectPath: process.cwd(),
				workerName: "my-astro-app",
				framework: { name: "Astro", configured: false, configure: () => ({}) },
				buildCommand: "astro build",
				outputDir: "dist",
			});
			expect(std.out).toMatchInlineSnapshot(`
				"
				Auto-detected Project Settings:
				 - Worker Name: my-astro-app
				 - Framework: Astro
				 - Build Command: astro build
				 - Output Directory: dist
				"
			`);
		});

		it("should omit the framework entry when they it is not part of the details object", () => {
			displayAutoConfigDetails({
				configured: false,
				projectPath: process.cwd(),
				workerName: "my-app",
				buildCommand: "npm run build",
				outputDir: "dist",
			});
			expect(std.out).toMatchInlineSnapshot(`
				"
				Auto-detected Project Settings:
				 - Worker Name: my-app
				 - Build Command: npm run build
				 - Output Directory: dist
				"
			`);
		});

		it("should omit the framework and build command entries when they are not part of the details object", () => {
			displayAutoConfigDetails({
				configured: false,
				projectPath: process.cwd(),
				workerName: "my-site",
				outputDir: "dist",
			});
			expect(std.out).toMatchInlineSnapshot(`
				"
				Auto-detected Project Settings:
				 - Worker Name: my-site
				 - Output Directory: dist
				"
			`);
		});
	});

	describe("confirmAutoConfigDetails()", () => {
		const { setIsTTY } = useMockIsTTY();

		describe("interactive mode", () => {
			test("no modifications applied", async () => {
				setIsTTY(true);

				mockConfirm({
					text: "Do you want to modify these settings?",
					result: false,
				});
				const updatedAutoConfigDetails = await confirmAutoConfigDetails({
					workerName: "worker-name",
					buildCommand: "npm run build",
					projectPath: "<PROJECT_PATH>",
					configured: false,
				});

				expect(updatedAutoConfigDetails).toMatchInlineSnapshot(`
					Object {
					  "buildCommand": "npm run build",
					  "configured": false,
					  "projectPath": "<PROJECT_PATH>",
					  "workerName": "worker-name",
					}
				`);
			});

			test("settings can be updated in a plain static site without a framework nor a build script", async () => {
				setIsTTY(true);

				mockConfirm({
					text: "Do you want to modify these settings?",
					result: true,
				});
				mockPrompt({
					text: "What do you want to name your Worker?",
					result: "new-name",
				});
				mockPrompt({
					text: "What directory contains your applications' output/asset files?",
					result: "./_public_",
				});
				mockPrompt({
					text: "What is your application's build command?",
					result: "npm run app:build",
				});

				const updatedAutoConfigDetails = await confirmAutoConfigDetails({
					workerName: "my-worker",
					buildCommand: "npm run build",
					outputDir: "<OUTPUT_DIR>",
					projectPath: "<PROJECT_PATH>",
					configured: false,
				});
				expect(updatedAutoConfigDetails).toMatchInlineSnapshot(`
				Object {
				  "buildCommand": "npm run app:build",
				  "configured": false,
				  "outputDir": "./_public_",
				  "projectPath": "<PROJECT_PATH>",
				  "workerName": "new-name",
				}
			`);
			});

			test("settings can be updated in a static app using a framework", async () => {
				setIsTTY(true);

				mockConfirm({
					text: "Do you want to modify these settings?",
					result: true,
				});
				mockPrompt({
					text: "What do you want to name your Worker?",
					result: "my-astro-worker",
				});
				mockPrompt({
					text: "What directory contains your applications' output/asset files?",
					result: "",
				});
				mockPrompt({
					text: "What is your application's build command?",
					result: "npm run build",
				});

				const updatedAutoConfigDetails = await confirmAutoConfigDetails({
					workerName: "my-astro-site",
					buildCommand: "astro build",
					framework: {
						configured: false,
						configure: () => ({}),
						name: "astro",
					},
					outputDir: "<OUTPUT_DIR>",
					projectPath: "<PROJECT_PATH>",
					configured: false,
				});
				expect(updatedAutoConfigDetails).toMatchInlineSnapshot(`
				Object {
				  "buildCommand": "npm run build",
				  "configured": false,
				  "framework": Object {
				    "configure": [Function],
				    "configured": false,
				    "name": "astro",
				  },
				  "outputDir": "",
				  "projectPath": "<PROJECT_PATH>",
				  "workerName": "my-astro-worker",
				}
			`);
			});
		});

		describe("non-interactive mode", () => {
			test("no modifications are applied in non-interactive", async () => {
				setIsTTY(false);

				const updatedAutoConfigDetails = await confirmAutoConfigDetails({
					workerName: "worker-name",
					buildCommand: "npm run build",
					projectPath: "<PROJECT_PATH>",
					configured: false,
				});

				expect(updatedAutoConfigDetails).toMatchInlineSnapshot(`
				Object {
				  "buildCommand": "npm run build",
				  "configured": false,
				  "projectPath": "<PROJECT_PATH>",
				  "workerName": "worker-name",
				}
			`);
			});
		});
	});
});
