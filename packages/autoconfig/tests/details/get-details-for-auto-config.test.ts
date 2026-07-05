import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	mockConsoleMethods,
	runInTempDir,
	seed,
} from "@cloudflare/workers-utils/test-helpers";
import { afterEach, describe, it, vi } from "vitest";
import * as details from "../../src/details";
import { createMockContext } from "../helpers/mock-context";
import type { Config } from "@cloudflare/workers-utils";

describe("autoconfig details - getDetailsForAutoConfig()", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	const context = createMockContext();

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("should set configured: true if a configPath exists", async ({
		expect,
	}) => {
		await expect(
			details.getDetailsForAutoConfig({
				wranglerConfig: { configPath: "/tmp" } as Config,
				context,
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

			await expect(
				details.getDetailsForAutoConfig({ context })
			).resolves.toMatchObject({
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

		const result = await details.getDetailsForAutoConfig({ context });

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
			details.getDetailsForAutoConfig({ context })
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: The Cloudflare application detection logic has been run in the root of a workspace instead of targeting a specific project. Change your working directory to one of the applications in the workspace and try again.]`
		);
	});

	it("should not bail when run in the root of a workspace if the root is included as a workspace package", async ({
		expect,
	}) => {
		await seed({
			"pnpm-workspace.yaml": "packages:\n  - 'packages/*'\n  - '.'\n",
			"package.json": JSON.stringify({
				name: "my-workspace",
				workspaces: ["packages/*", "."],
			}),
			"index.html": "<h1>Hello World</h1>",
			"packages/my-app/package.json": JSON.stringify({ name: "my-app" }),
			"packages/my-app/index.html": "<h1>Hello World</h1>",
		});

		const result = await details.getDetailsForAutoConfig({ context });

		expect(result.isWorkspaceRoot).toBe(true);
		expect(result.framework?.id).toBe("static");
	});

	it("should set isWorkspaceRoot to false for non-workspace projects", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({
				name: "my-app",
			}),
			"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
			"index.html": "<h1>Hello World</h1>",
		});

		const result = await details.getDetailsForAutoConfig({ context });

		expect(result.isWorkspaceRoot).toBe(false);
	});

	it("should warn when no lock file is detected (project may be inside a workspace)", async ({
		expect,
	}) => {
		// Create a project without a lock file - simulating a project inside a workspace
		// where the lock file is at the workspace root
		await seed({
			"package.json": JSON.stringify({
				name: "my-app",
				dependencies: { astro: "6" },
			}),
			"index.html": "<h1>Hello World</h1>",
		});

		await details.getDetailsForAutoConfig({ context });

		expect(std.warn).toContain(
			"No lock file has been detected in the current working directory."
		);
		expect(std.warn).toContain("project is part of a workspace");
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

		await expect(
			details.getDetailsForAutoConfig({ context })
		).resolves.toMatchObject({
			buildCommand: "npm run build",
		});
	});

	describe("project adapters", () => {
		it("detects an explicit html file as a no-write single-file site", async ({
			expect,
		}) => {
			await writeFile("index.html", "<h1>Hello World</h1>");

			const result = await details.getDetailsForAutoConfig({
				context,
				deployIntent: {
					trigger: "explicit-target",
					originalTarget: "index.html",
					targetKind: "file",
					currentDeployInterpretation: "script",
					sourceCategory: "html-file",
				},
			});

			expect(result).toMatchObject({
				configured: false,
				adapterId: "single-file-site",
				projectKind: "single-file-site",
				confidence: "high",
				sourceCategory: "html-file",
				configurationPlan: {
					mode: "no-write",
					generatedFiles: ["temporary-assets-directory"],
				},
				deployTarget: {
					type: "single-html-file",
					sourcePath: expect.stringContaining("index.html"),
				},
			});
		});

		it("does not claim explicit worker scripts without a high-confidence adapter", async ({
			expect,
		}) => {
			await writeFile(
				"index.js",
				"export default { fetch() { return new Response('ok'); } };"
			);

			await expect(
				details.getDetailsForAutoConfig({
					context,
					deployIntent: {
						trigger: "explicit-target",
						originalTarget: "index.js",
						targetKind: "file",
						currentDeployInterpretation: "script",
						sourceCategory: "worker-script",
					},
				})
			).resolves.toMatchObject({ configured: true });
		});

		it("detects explicit static folders as no-write assets by default", async ({
			expect,
		}) => {
			await seed({
				"site/index.html": "<h1>Hello World</h1>",
			});

			await expect(
				details.getDetailsForAutoConfig({
					context,
					deployIntent: {
						trigger: "explicit-target",
						originalTarget: "site",
						targetKind: "directory",
						currentDeployInterpretation: "assets",
						sourceCategory: "directory",
					},
				})
			).resolves.toMatchObject({
				configured: false,
				adapterId: "static-assets",
				configurationPlan: { mode: "no-write" },
			});
		});

		it("detects a gated Vite app target as a static package app", async ({
			expect,
		}) => {
			await seed({
				"app/package.json": JSON.stringify({
					name: "vite-app",
					scripts: { build: "vite build" },
					devDependencies: { vite: "7.0.0" },
				}),
				"app/pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
				"app/dist/index.html": "<h1>Hello from Vite</h1>",
			});

			await expect(
				details.getDetailsForAutoConfig({
					context,
					deployIntent: {
						trigger: "explicit-target",
						originalTarget: "app",
						targetKind: "directory",
						currentDeployInterpretation: "assets",
						sourceCategory: "directory",
					},
				})
			).resolves.toMatchObject({ configured: true });

			await expect(
				details.getDetailsForAutoConfig({
					context,
					deployIntent: {
						trigger: "explicit-target",
						originalTarget: "app",
						targetKind: "directory",
						currentDeployInterpretation: "assets",
						sourceCategory: "directory",
						staticAssetsAutoConfig: true,
					},
				})
			).resolves.toMatchObject({
				configured: false,
				adapterId: "static-package-app",
				projectKind: "static-assets",
				confidence: "high",
				outputDir: "dist",
				sourceCategory: "package-app",
				configurationPlan: {
					mode: "no-write",
					commands: [
						{
							command: "pnpm run build",
							when: "build",
							label: "build",
						},
					],
					deploy: {
						generatedAssetsDirectory: "build-output",
					},
				},
				deployTarget: {
					type: "static-app-output",
					assetsDirectory: expect.stringContaining("app/dist"),
				},
			});
		});

		it("detects explicit Express entrypoints", async ({ expect }) => {
			await seed({
				"package.json": JSON.stringify({ dependencies: { express: "5" } }),
				"index.js": `
					import express from "express";
					const app = express();
					app.get("/", (_req, res) => res.send("ok"));
					app.listen(3000);
				`,
			});

			await expect(
				details.getDetailsForAutoConfig({
					context,
					deployIntent: {
						trigger: "explicit-target",
						originalTarget: "index.js",
						targetKind: "file",
						currentDeployInterpretation: "script",
						sourceCategory: "worker-script",
					},
				})
			).resolves.toMatchObject({
				configured: false,
				adapterId: "express-node-http-server",
				projectKind: "node-http-server",
				configurationPlan: {
					mode: "persistent",
					wranglerConfig: {
						main: "src/worker.js",
						compatibility_flags: ["nodejs_compat"],
					},
					filesToCreate: [
						{
							path: "src/worker.js",
							contents: expect.stringContaining(
								"export default httpServerHandler({ port });"
							),
						},
					],
					summaryFields: {
						entrypoint: "index.js",
						generatedEntrypoint: "src/worker.js",
						port: 3000,
					},
				},
			});
		});

		it("detects explicit Dockerfile targets only with the Containers gate", async ({
			expect,
		}) => {
			await writeFile("Dockerfile", "FROM node:22\nEXPOSE 8080\n");

			await expect(
				details.getDetailsForAutoConfig({
					context,
					deployIntent: {
						trigger: "explicit-target",
						originalTarget: "Dockerfile",
						targetKind: "file",
						currentDeployInterpretation: "script",
						sourceCategory: "dockerfile",
					},
				})
			).resolves.toMatchObject({ configured: true });

			await expect(
				details.getDetailsForAutoConfig({
					context,
					deployIntent: {
						trigger: "explicit-target",
						originalTarget: "Dockerfile",
						targetKind: "file",
						currentDeployInterpretation: "script",
						sourceCategory: "dockerfile",
						containersAutoConfig: true,
					},
				})
			).resolves.toMatchObject({
				configured: false,
				adapterId: "dockerfile-container",
				projectKind: "container-image",
				configurationPlan: {
					mode: "persistent",
					dependencies: [{ name: "@cloudflare/containers" }],
					wranglerConfig: {
						main: "src/worker.js",
						containers: [
							{
								class_name: "AppContainer",
								image: "./Dockerfile",
								max_instances: 1,
							},
						],
						durable_objects: {
							bindings: [
								{
									name: "APP_CONTAINER",
									class_name: "AppContainer",
								},
							],
						},
						migrations: [
							{
								new_sqlite_classes: ["AppContainer"],
							},
						],
					},
					filesToCreate: [
						{
							path: "src/worker.js",
							contents: expect.stringContaining('PORT: "8080"'),
						},
					],
					summaryFields: {
						dockerfile: "Dockerfile",
						generatedEntrypoint: "src/worker.js",
						port: 8080,
						routing: "singleton",
						maxInstances: 1,
					},
				},
			});
		});

		it("falls back to port 80 and warns when a Dockerfile has no port hints", async ({
			expect,
		}) => {
			await writeFile("Dockerfile", "FROM nginx:1\n");

			await expect(
				details.getDetailsForAutoConfig({
					context,
					deployIntent: {
						trigger: "explicit-target",
						originalTarget: "Dockerfile",
						targetKind: "file",
						currentDeployInterpretation: "script",
						sourceCategory: "dockerfile",
						containersAutoConfig: true,
					},
				})
			).resolves.toMatchObject({
				adapterId: "dockerfile-container",
				configurationPlan: {
					warnings: expect.arrayContaining([
						"No EXPOSE or ENV PORT was detected. Port 80 was selected; add EXPOSE to your Dockerfile if your app listens elsewhere.",
					]),
					summaryFields: {
						port: 80,
					},
				},
			});
		});

		it("rejects bare Dockerfile-to-Containers auto-configuration in non-interactive sessions", async ({
			expect,
		}) => {
			await writeFile("Dockerfile", "FROM node:22\nEXPOSE 3000\n");

			await expect(
				details.getDetailsForAutoConfig({
					context: createMockContext({ isNonInteractiveOrCI: () => true }),
					deployIntent: {
						trigger: "setup",
						containersAutoConfig: true,
					},
				})
			).rejects.toThrow(
				"Dockerfile-to-Containers auto-configuration in non-interactive sessions requires an explicit Dockerfile target or `wrangler setup --yes`."
			);
		});

		it("allows setup --yes Dockerfile-to-Containers auto-configuration in non-interactive sessions", async ({
			expect,
		}) => {
			await writeFile("Dockerfile", "FROM node:22\nEXPOSE 3000\n");

			await expect(
				details.getDetailsForAutoConfig({
					context: createMockContext({ isNonInteractiveOrCI: () => true }),
					deployIntent: {
						trigger: "setup",
						containersAutoConfig: true,
						allowNonInteractivePersistentSetup: true,
					},
				})
			).resolves.toMatchObject({
				adapterId: "dockerfile-container",
				configurationPlan: {
					summaryFields: {
						port: 3000,
					},
				},
			});
		});

		it("allows explicit Dockerfile targets in non-interactive sessions", async ({
			expect,
		}) => {
			await writeFile("Dockerfile", "FROM node:22\nEXPOSE 3000\n");

			await expect(
				details.getDetailsForAutoConfig({
					context: createMockContext({ isNonInteractiveOrCI: () => true }),
					deployIntent: {
						trigger: "explicit-target",
						originalTarget: "Dockerfile",
						targetKind: "file",
						currentDeployInterpretation: "script",
						sourceCategory: "dockerfile",
						containersAutoConfig: true,
					},
				})
			).resolves.toMatchObject({
				adapterId: "dockerfile-container",
				configurationPlan: {
					summaryFields: {
						port: 3000,
					},
				},
			});
		});
	});

	it("an error should be thrown if no output dir can be detected", async ({
		expect,
	}) => {
		await expect(
			details.getDetailsForAutoConfig({ context })
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Could not detect a directory containing static files (e.g. html, css and js) for the project]`
		);
	});

	it("outputDir should be set to cwd if an index.html file exists", async ({
		expect,
	}) => {
		await writeFile("index.html", `<h1>Hello World</h1>`);

		await expect(
			details.getDetailsForAutoConfig({ context })
		).resolves.toMatchObject({
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

		await expect(
			details.getDetailsForAutoConfig({ context })
		).resolves.toMatchObject({
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

		await expect(
			details.getDetailsForAutoConfig({ context })
		).resolves.toMatchObject({
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
					context,
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
					context,
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
				context,
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
				context,
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
				[join(cacheFolder, "pages.json")]: JSON.stringify({
					account_id: "test-account",
				}),
			});

			const cacheContext = createMockContext({
				getCacheFolder: () => cacheFolder,
			});

			const result = await details.getDetailsForAutoConfig({
				context: cacheContext,
			});

			expect(result.framework?.id).toBe("cloudflare-pages");
			expect(result.framework?.name).toBe("Cloudflare Pages");
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

			const confirmContext = createMockContext({
				dialogs: {
					confirm: vi.fn().mockResolvedValue(true),
					prompt: vi.fn().mockResolvedValue(""),
					select: vi.fn().mockResolvedValue(""),
				},
			});

			const result = await details.getDetailsForAutoConfig({
				context: confirmContext,
			});

			expect(result.framework?.id).toBe("cloudflare-pages");
			expect(result.framework?.name).toBe("Cloudflare Pages");
		});

		it("should not detect Pages project when the user denies that, even if the functions directory exists and no framework is detected", async ({
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

			const denyContext = createMockContext({
				dialogs: {
					confirm: vi.fn().mockResolvedValue(false),
					prompt: vi.fn().mockResolvedValue(""),
					select: vi.fn().mockResolvedValue(""),
				},
			});

			const result = await details.getDetailsForAutoConfig({
				context: denyContext,
			});

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

			const result = await details.getDetailsForAutoConfig({ context });

			// Should detect Astro, not Pages
			expect(result.framework?.id).toBe("astro");
		});
	});

	describe("multiple frameworks detected", () => {
		describe("local environment (non-CI)", () => {
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

				const result = await details.getDetailsForAutoConfig({ context });

				// Should return a framework (either astro or angular)
				expect(result.framework).toBeDefined();
				expect(["astro", "angular"]).toContain(result.framework?.id);
			});
		});

		describe("CI environment", () => {
			const ciContext = createMockContext({
				isNonInteractiveOrCI: () => true,
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

				await expect(
					details.getDetailsForAutoConfig({ context: ciContext })
				).rejects.toThrow(
					/Cloudflare's tooling was unable to automatically configure your project, since multiple frameworks were found/
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

				const result = await details.getDetailsForAutoConfig({
					context: ciContext,
				});
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
					details.getDetailsForAutoConfig({ context: ciContext })
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`
					[Error: Cloudflare's tooling was unable to automatically configure your project, since multiple frameworks were found: Gatsby, Gridsome.

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

			const result = await details.getDetailsForAutoConfig({ context });
			expect(result.framework?.id).toBe("next");
		});

		it("should fallback to static framework when no frameworks detected", async ({
			expect,
		}) => {
			await seed({
				"index.html": "<h1>Hello World</h1>",
				"package.json": JSON.stringify({}),
			});

			const result = await details.getDetailsForAutoConfig({ context });

			expect(result.framework?.id).toBe("static");
		});
	});
});
