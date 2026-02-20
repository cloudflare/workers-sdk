import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { seed } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import * as details from "../../../autoconfig/details";
import * as configCache from "../../../config-cache";
import * as isInteractiveModule from "../../../is-interactive";
import { clearOutputFilePath } from "../../../output";
import { getPackageManager, NpmPackageManager } from "../../../package-manager";
import { PAGES_CONFIG_CACHE_FILENAME } from "../../../pages/constants";
import { mockConsoleMethods } from "../../helpers/mock-console";
import { mockConfirm } from "../../helpers/mock-dialogs";
import { useMockIsTTY } from "../../helpers/mock-istty";
import { runInTempDir } from "../../helpers/run-in-tmp";
import type { Config } from "@cloudflare/workers-utils";
import type { Mock, MockInstance } from "vitest";

describe("autoconfig details - getDetailsForAutoConfig()", () => {
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	mockConsoleMethods();
	let isNonInteractiveOrCISpy: MockInstance;

	beforeEach(() => {
		setIsTTY(true);
		(getPackageManager as Mock).mockResolvedValue(NpmPackageManager);
		isNonInteractiveOrCISpy = vi
			.spyOn(isInteractiveModule, "isNonInteractiveOrCI")
			.mockReturnValue(false);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		clearOutputFilePath();
		isNonInteractiveOrCISpy.mockRestore();
	});

	it("should set configured: true if a configPath exists", async ({
		expect,
	}) => {
		await expect(
			details.getDetailsForAutoConfig({
				wranglerConfig: { configPath: "/tmp" } as Config,
			})
		).resolves.toMatchObject({ configured: true });
	});

	// Check that Astro is detected. We don't want to duplicate the tests of @netlify/build-info
	// by exhaustively checking every possible combination
	it.for(["npm", "pnpm"] as const)(
		"should perform basic framework detection (using %s)",
		async (pm, { expect }) => {
			await writeFile(
				"package.json",
				JSON.stringify({
					dependencies: {
						astro: "5",
					},
				})
			);

			// Create the appropriate lockfile so @netlify/build-info detects the package manager
			if (pm === "pnpm") {
				await writeFile("pnpm-lock.yaml", "lockfileVersion: 6.0");
			} else {
				await writeFile(
					"package-lock.json",
					JSON.stringify({ lockfileVersion: 3 })
				);
			}

			await expect(details.getDetailsForAutoConfig()).resolves.toMatchObject({
				buildCommand: pm === "pnpm" ? "pnpm astro build" : "npx astro build",
				configured: false,
				outputDir: "dist",
				packageJson: {
					dependencies: {
						astro: "5",
					},
				},
			});
		}
	);

	it("should select the known framework when multiple frameworks are detected but only one is known", async ({
		expect,
	}) => {
		// Gatsby is not in allKnownFrameworks, so only Astro should be considered
		await writeFile(
			"package.json",
			JSON.stringify({
				dependencies: {
					astro: "5",
					gatsby: "5",
				},
			})
		);

		const result = await details.getDetailsForAutoConfig();

		// Should select Astro since it's the only known framework
		expect(result.framework?.id).toBe("astro");
		expect(result.framework?.name).toBe("Astro");
	});

	it("should bail when run in the root of a workspace", async ({ expect }) => {
		await seed({
			"pnpm-workspace.yaml": "packages:\n  - 'packages/*'\n",
			"package.json": JSON.stringify({
				name: "my-workspace",
				workspaces: ["packages/*"],
			}),
			"packages/my-app/package.json": JSON.stringify({ name: "my-app" }),
			"packages/my-app/index.html": "<h1>Hello World</h1>",
		});

		await expect(
			details.getDetailsForAutoConfig()
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: The Wrangler application detection logic has been run in the root of a workspace, this is not supported. Change your working directory to one of the applications in the workspace and try again.]`
		);
	});

	it("should use npm build instead of framework build if present", async ({
		expect,
	}) => {
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

	it("an error should be thrown if no output dir can be detected", async ({
		expect,
	}) => {
		await expect(
			details.getDetailsForAutoConfig()
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Could not detect a directory containing static files (e.g. html, css and js) for the project]`
		);
	});

	it("outputDir should be set to cwd if an index.html file exists", async ({
		expect,
	}) => {
		await writeFile("index.html", `<h1>Hello World</h1>`);

		await expect(details.getDetailsForAutoConfig()).resolves.toMatchObject({
			outputDir: ".",
		});
	});

	it("outputDir should find first child directory with an index.html file", async ({
		expect,
	}) => {
		await seed({
			"public/index.html": `<h1>Hello World</h1>`,
			"random/index.html": `<h1>Hello World</h1>`,
		});

		await expect(details.getDetailsForAutoConfig()).resolves.toMatchObject({
			outputDir: "public",
		});
	});

	it("outputDir should prioritize the project directory over its child directories", async ({
		expect,
	}) => {
		await seed({
			"index.html": `<h1>Hello World</h1>`,
			"public/index.html": `<h1>Hello World</h1>`,
		});

		await expect(details.getDetailsForAutoConfig()).resolves.toMatchObject({
			outputDir: ".",
		});
	});

	const workerNamesToTest = [
		{ rawName: "my-project-1", normalizedName: "my-project-1" },
		{
			rawName: "--my-other-project%1_",
			normalizedName: "my-other-project-1",
		},
		{
			rawName: "x".repeat(100),
			normalizedName: "x".repeat(63),
		},
	];

	it.for(workerNamesToTest)(
		"should use the directory name as the worker name for a plain static site, normalizing it if needed (%s)",
		async (
			{ rawName: dirname, normalizedName: expectedWorkerName },
			{ expect }
		) => {
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
	);

	it.for(workerNamesToTest)(
		"should use the project name from the package.json file when available as the worker name, normalizing it if needed (%s)",
		async (
			{ rawName: projectName, normalizedName: expectedWorkerName },
			{ expect }
		) => {
			const dirname = `project-${randomUUID()}`;
			await seed({
				[`./${dirname}/package.json`]: JSON.stringify({ name: projectName }),
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
	);

	it("WRANGLER_CI_OVERRIDE_NAME, when set should override the worker name", async ({
		expect,
	}) => {
		vi.stubEnv("WRANGLER_CI_OVERRIDE_NAME", "overridden-worker-name");

		await seed({
			"./my-project/index.html": "<h1>Hello World</h1>",
		});
		await expect(
			details.getDetailsForAutoConfig({
				projectPath: `./my-project`,
			})
		).resolves.toMatchObject({
			workerName: "overridden-worker-name",
		});
	});

	describe("Pages project detection", () => {
		it("should detect Pages project when pages_build_output_dir is set in wrangler config", async ({
			expect,
		}) => {
			await seed({
				"public/index.html": `<h1>Hello World</h1>`,
			});

			const result = await details.getDetailsForAutoConfig({
				wranglerConfig: {
					configPath: "/tmp/wrangler.toml",
					pages_build_output_dir: "./dist",
				} as Config,
			});

			expect(result.configured).toBe(false);
			expect(result.framework?.id).toBe("cloudflare-pages");
			expect(result.framework?.name).toBe("Cloudflare Pages");
		});

		it("should detect Pages project when pages.json cache file exists", async ({
			expect,
		}) => {
			const cacheFolder = join(process.cwd(), ".cache");
			await seed({
				"public/index.html": `<h1>Hello World</h1>`,
				// Create a cache folder in the temp directory and add pages.json to it
				[join(cacheFolder, PAGES_CONFIG_CACHE_FILENAME)]: JSON.stringify({
					account_id: "test-account",
				}),
			});

			// Mock getCacheFolder to return our temp cache folder
			const getCacheFolderSpy = vi
				.spyOn(configCache, "getCacheFolder")
				.mockReturnValue(cacheFolder);

			try {
				const result = await details.getDetailsForAutoConfig();

				expect(result.framework?.id).toBe("cloudflare-pages");
				expect(result.framework?.name).toBe("Cloudflare Pages");
			} finally {
				getCacheFolderSpy.mockRestore();
			}
		});

		it("should detect Pages project when functions directory exists, no framework is detected and the user confirms that it is", async ({
			expect,
		}) => {
			await seed({
				"public/index.html": `<h1>Hello World</h1>`,
				"functions/hello.js": `
					export function onRequest(context) {
						return new Response("Hello, world!");
					}
				`,
			});

			mockConfirm({
				text: "We have identified a `functions` directory in this project, which might indicate you have an active Cloudflare Pages deployment. Is this correct?",
				result: true,
			});

			const result = await details.getDetailsForAutoConfig();

			expect(result.framework?.id).toBe("cloudflare-pages");
			expect(result.framework?.name).toBe("Cloudflare Pages");
		});

		it("should not detect Pages project when the user denies that, even it the functions directory exists and no framework is detected", async ({
			expect,
		}) => {
			await seed({
				"public/index.html": `<h1>Hello World</h1>`,
				"functions/hello.js": `
					export function onRequest(context) {
						return new Response("Hello, world!");
					}
				`,
			});

			mockConfirm({
				text: "We have identified a `functions` directory in this project, which might indicate you have an active Cloudflare Pages deployment. Is this correct?",
				result: false,
			});

			const result = await details.getDetailsForAutoConfig();

			expect(result.framework?.id).toBe("static");
			expect(result.framework?.name).toBe("Static");
		});

		it("should not detect Pages project when functions directory exists but a framework is detected", async ({
			expect,
		}) => {
			await seed({
				"functions/hello.js":
					"export const myFun = () => { console.log('Hello!'); };",
				"package.json": JSON.stringify({
					dependencies: {
						astro: "5",
					},
				}),
			});

			const result = await details.getDetailsForAutoConfig();

			// Should detect Astro, not Pages
			expect(result.framework?.id).toBe("astro");
		});
	});

	describe("multiple frameworks detected", () => {
		describe("local environment (non-CI)", () => {
			beforeEach(() => {
				isNonInteractiveOrCISpy.mockReturnValue(false);
			});

			it("should return a single framework when multiple frameworks are detected", async ({
				expect,
			}) => {
				await writeFile(
					"package.json",
					JSON.stringify({
						dependencies: {
							astro: "5",
							"@angular/core": "18",
						},
					})
				);

				const result = await details.getDetailsForAutoConfig();

				// Should return a framework (either astro or angular)
				expect(result.framework).toBeDefined();
				expect(["astro", "angular"]).toContain(result.framework?.id);
			});
		});

		describe("CI environment", () => {
			beforeEach(() => {
				isNonInteractiveOrCISpy.mockReturnValue(true);
			});

			it("should throw MultipleFrameworksCIError when multiple known frameworks are detected in CI", async ({
				expect,
			}) => {
				await writeFile(
					"package.json",
					JSON.stringify({
						dependencies: {
							astro: "5",
							nuxt: "3",
						},
					})
				);

				await expect(details.getDetailsForAutoConfig()).rejects.toThrowError(
					/Wrangler was unable to automatically configure your project to work with Cloudflare, since multiple frameworks were found/
				);
			});

			it("should NOT throw when Vite and another known framework are detected in CI (Vite is filtered out)", async ({
				expect,
			}) => {
				await writeFile(
					"package.json",
					JSON.stringify({
						dependencies: {
							astro: "5",
							vite: "5",
						},
					})
				);

				const result = await details.getDetailsForAutoConfig();
				expect(result.framework?.id).toBe("astro");
			});

			it("should throw MultipleFrameworksCIError when multiple unknown frameworks are detected in CI", async ({
				expect,
			}) => {
				await writeFile(
					"package.json",
					JSON.stringify({
						dependencies: {
							gatsby: "5",
							gridsome: "1",
						},
					})
				);

				await expect(
					details.getDetailsForAutoConfig()
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`
					[Error: Wrangler was unable to automatically configure your project to work with Cloudflare, since multiple frameworks were found: Gatsby, Gridsome.

					To fix this issue either:
					  - check your project's configuration to make sure that the target framework
					    is the only configured one and try again
					  - run \`wrangler setup\` locally to get an interactive user experience where
					    you can specify what framework you want to target
					]
				`
				);
			});
		});

		it("should return non-Vite framework when Vite and another known framework are detected", async ({
			expect,
		}) => {
			await writeFile(
				"package.json",
				JSON.stringify({
					dependencies: {
						next: "14",
						vite: "5",
					},
				})
			);

			const result = await details.getDetailsForAutoConfig();
			expect(result.framework?.id).toBe("next");
		});

		it("should fallback to static framework when no frameworks detected", async ({
			expect,
		}) => {
			await seed({
				"index.html": "<h1>Hello World</h1>",
				"package.json": JSON.stringify({}),
			});

			const result = await details.getDetailsForAutoConfig();

			expect(result.framework?.id).toBe("static");
		});
	});
});
