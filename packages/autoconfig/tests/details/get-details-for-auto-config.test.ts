import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NpmPackageManager } from "@cloudflare/workers-utils";
import {
	mockConsoleMethods,
	runInTempDir,
	seed,
} from "@cloudflare/workers-utils/test-helpers";
import { afterEach, describe, it, vi } from "vitest";
import * as details from "../../src/details";
import { detectFramework } from "../../src/details/framework-detection";
import { createMockContext } from "../helpers/mock-context";
import type { Config } from "@cloudflare/workers-utils";

const fileSystemErrors = vi.hoisted(() => ({
	readdir: new Map<string, string>(),
	stat: new Map<string, string>(),
}));
const statAliases = vi.hoisted(() => new Map<string, string>());

vi.mock("node:fs/promises", async (importOriginal) => {
	const original = await importOriginal<typeof import("node:fs/promises")>();

	function throwConfiguredError(errors: Map<string, string>, path: unknown) {
		const stringPath = String(path);
		const code = errors.get(stringPath);
		if (code !== undefined) {
			throw Object.assign(new Error(`${code}: ${stringPath}`), {
				code,
				path: stringPath,
			});
		}
	}

	return {
		...original,
		readdir: (...args: Parameters<typeof original.readdir>) => {
			throwConfiguredError(fileSystemErrors.readdir, args[0]);
			return Reflect.apply(original.readdir, undefined, args);
		},
		stat: (...args: Parameters<typeof original.stat>) => {
			throwConfiguredError(fileSystemErrors.stat, args[0]);
			const alias = statAliases.get(String(args[0]));
			if (alias !== undefined) {
				return Reflect.apply(original.stat, undefined, [
					alias,
					...args.slice(1),
				]);
			}
			return Reflect.apply(original.stat, undefined, args);
		},
	};
});

// Passes through to the real detection unless a test overrides it, for cases
// that cannot be reproduced with files on disk alone
vi.mock("../../src/details/framework-detection", async (importOriginal) => {
	const original =
		await importOriginal<
			typeof import("../../src/details/framework-detection")
		>();

	return {
		...original,
		detectFramework: vi.fn(original.detectFramework),
	};
});

describe("autoconfig details - getDetailsForAutoConfig()", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	const context = createMockContext();

	afterEach(() => {
		fileSystemErrors.readdir.clear();
		fileSystemErrors.stat.clear();
		statAliases.clear();
		vi.unstubAllGlobals();
	});

	it("should set configured: true if a configPath exists during legacy Wrangler detection", async ({
		expect,
	}) => {
		await expect(
			details.getDetailsForAutoConfig({
				wranglerConfig: { configPath: "/tmp" } as Config,
				target: "wrangler",
				context,
			})
		).resolves.toMatchObject({ configured: true });
	});

	it("should migrate an existing Wrangler project by default", async ({
		expect,
	}) => {
		await writeFile("index.html", "<h1>Hello World</h1>");

		await expect(
			details.getDetailsForAutoConfig({
				wranglerConfig: { configPath: "/tmp" } as Config,
				context,
			})
		).resolves.toMatchObject({ configured: false });
	});

	it("should detect commands without using the package dev script when a Cloudflare config exists", async ({
		expect,
	}) => {
		await seed({
			"cloudflare.config.ts": "export default {};",
			"package.json": JSON.stringify({
				scripts: { build: "astro build", dev: "cf dev" },
				dependencies: { astro: "5" },
			}),
			"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
		});

		await expect(
			details.getDetailsForAutoConfig({ context })
		).resolves.toMatchObject({
			configured: true,
			framework: { id: "astro", supportsMode: true },
			buildCommand: "npx astro build",
			devCommand: "npx astro dev",
			packageManager: { type: "npm" },
		});
	});

	it("should defer a configured unsupported framework to a Cloudflare dev server", async ({
		expect,
	}) => {
		await seed({
			"cloudflare.config.ts": "export default {};",
			"package.json": JSON.stringify({
				scripts: { build: "cf build", dev: "cf dev" },
				dependencies: { hono: "4", vite: "8" },
			}),
			"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
		});

		await expect(
			details.getDetailsForAutoConfig({ context })
		).resolves.toMatchObject({
			configured: true,
			framework: { id: "hono" },
			buildCommand: undefined,
			devCommand: undefined,
			packageManager: { type: "npm" },
		});
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
				devCommand: pm === "pnpm" ? "pnpm astro dev" : "npx astro dev",
				framework: { supportsMode: true },
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
		// Gatsby is not a known framework, so only Astro should be considered
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

	it("should use the direct framework build instead of an npm script for cf", async ({
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
			buildCommand: "npx astro build",
		});
	});

	it("should preserve npm build script detection for Wrangler", async ({
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
			details.getDetailsForAutoConfig({ target: "wrangler", context })
		).resolves.toMatchObject({
			buildCommand: "npm run build",
		});
	});

	it("should include the Vite plugin command environment for cf", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({ dependencies: { vite: "8" } }),
			"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
		});

		await expect(
			details.getDetailsForAutoConfig({ context })
		).resolves.toMatchObject({
			framework: { id: "vite" },
			buildCommand: "npx vite build",
			env: {
				CLOUDFLARE_VITE_FORCE_BUILD_OUTPUT: "true",
			},
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

	it("outputDir should require index.html to use exact casing", async ({
		expect,
	}) => {
		await seed({
			"public/INDEX.HTML": `<h1>Hello World</h1>`,
		});
		statAliases.set(
			join(process.cwd(), "public", "index.html"),
			join(process.cwd(), "public", "INDEX.HTML")
		);

		await expect(
			details.getDetailsForAutoConfig({ context })
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Could not detect a directory containing static files (e.g. html, css and js) for the project]`
		);
	});

	it("outputDir should ignore inaccessible child directories", async ({
		expect,
	}) => {
		await seed({
			".Trash/placeholder": "",
			"public/index.html": `<h1>Hello World</h1>`,
		});
		fileSystemErrors.readdir.set(join(process.cwd(), ".Trash"), "EPERM");
		fileSystemErrors.stat.set(
			join(process.cwd(), ".Trash", "index.html"),
			"EPERM"
		);

		await expect(
			details.getDetailsForAutoConfig({ context })
		).resolves.toMatchObject({
			outputDir: "public",
		});
	});

	it("outputDir should ignore child directories that cannot be statted", async ({
		expect,
	}) => {
		await seed({
			"0-cache/placeholder": "",
			"public/index.html": `<h1>Hello World</h1>`,
		});
		fileSystemErrors.stat.set(join(process.cwd(), "0-cache"), "EACCES");

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

	it("should use a caller-supplied outputDir instead of the detected project directory", async ({
		expect,
	}) => {
		await seed({
			"index.html": `<h1>Hello World</h1>`,
			".env": "SECRET=1",
			"public/index.html": `<h1>Hello World</h1>`,
		});

		await expect(
			details.getDetailsForAutoConfig({ context, outputDir: "public" })
		).resolves.toMatchObject({
			outputDir: "public",
		});
	});

	it.for(["astro", "next", "nuxt", "vite"])(
		"should select static assets for a caller-supplied outputDir instead of configuring %s",
		async (framework, { expect }) => {
			await seed({
				"package.json": JSON.stringify({
					name: "my-app",
					dependencies: { [framework]: "5" },
					scripts: { build: `${framework} build` },
				}),
				"static/index.html": `<h1>Hello World</h1>`,
			});

			await expect(
				details.getDetailsForAutoConfig({ context, outputDir: "static" })
			).resolves.toMatchObject({
				configured: false,
				framework: expect.objectContaining({ id: "static" }),
				outputDir: "static",
				buildCommand: undefined,
				devCommand: undefined,
			});
		}
	);

	it.for(["cf", "wrangler"] as const)(
		"should preserve an existing Vite deployment for %s when outputDir is supplied",
		async (target, { expect }) => {
			await seed({
				"package.json": JSON.stringify({
					name: "my-vite-app",
					dependencies: { vite: "8", "@cloudflare/vite-plugin": "1" },
					scripts: {
						build: "vite build",
						deploy: "vite build && wrangler deploy",
					},
				}),
				"vite.config.ts": `import { cloudflare } from "@cloudflare/vite-plugin";
					import { defineConfig } from "vite";
					export default defineConfig({ plugins: [cloudflare()] });`,
				"public/index.html": "<h1>Hello World</h1>",
				...(target === "cf"
					? { "cloudflare.config.ts": "export default {};" }
					: {}),
			});
			const existingDetails = await details.getDetailsForAutoConfig({
				context,
				target,
			});

			const result = await details.getDetailsForAutoConfig({
				context,
				target,
				outputDir: "public",
			});

			expect(result).toMatchObject({
				configured: true,
				framework: { id: "vite" },
			});
			expect(result).toEqual(existingDetails);
		}
	);

	it.for([
		{ input: "./public/", expected: "public" },
		{ input: "public/nested/..", expected: "public" },
		{ input: ".", expected: "." },
		{ input: "./", expected: "." },
		{ input: "../site", expected: join("..", "site") },
	])(
		"should normalize a caller-supplied outputDir of $input to $expected",
		async ({ input, expected }, { expect }) => {
			await seed({ "public/index.html": `<h1>Hello World</h1>` });

			await expect(
				details.getDetailsForAutoConfig({ context, outputDir: input })
			).resolves.toMatchObject({
				outputDir: expected,
			});
		}
	);

	it("should express an absolute caller-supplied outputDir relative to the project", async ({
		expect,
	}) => {
		await seed({ "public/index.html": `<h1>Hello World</h1>` });

		await expect(
			details.getDetailsForAutoConfig({
				context,
				outputDir: join(process.cwd(), "public"),
			})
		).resolves.toMatchObject({
			outputDir: "public",
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

		describe("functions directory with static files in the project root", () => {
			// Mirrors Wrangler in CI and agent sessions: the Pages prompt falls back
			// to `false` and the context reports a non-interactive environment.
			const nonInteractiveContext = createMockContext({
				isNonInteractiveOrCI: () => true,
				dialogs: {
					confirm: vi.fn().mockResolvedValue(false),
					prompt: vi.fn().mockResolvedValue(""),
					select: vi.fn().mockResolvedValue(""),
				},
			});
			const pagesFunction = `
				export function onRequest(context) {
					return new Response("Hello, world!");
				}
			`;

			it("should throw in a non-interactive run instead of deploying the root without its Functions", async ({
				expect,
			}) => {
				await seed({
					"index.html": `<h1>Hello World</h1>`,
					"functions/api/hello.js": pagesFunction,
				});

				await expect(
					details.getDetailsForAutoConfig({ context: nonInteractiveContext })
				).rejects.toThrowErrorMatchingInlineSnapshot(`
					[Error: This project has a \`functions\` directory and static files in its root, which looks like a Cloudflare Pages project using Pages Functions. Automatic configuration cannot migrate Pages Functions to Workers yet, and deploying the project root as static assets would leave the Functions undeployed.
					If \`functions\` contains Pages Functions, move the static files into a subdirectory (for example \`public/\`) and deploy with \`wrangler pages deploy public --project-name <name>\`, or migrate the Functions to a Worker: https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/
					If \`functions\` is not Pages Functions, move the static files into a subdirectory or add a \`cloudflare.config.ts\` file for the Worker.]
				`);
			});

			it("should name a Wrangler configuration file in the error for the wrangler target", async ({
				expect,
			}) => {
				await seed({
					"index.html": `<h1>Hello World</h1>`,
					"functions/api/hello.js": pagesFunction,
				});

				await expect(
					details.getDetailsForAutoConfig({
						context: nonInteractiveContext,
						target: "wrangler",
					})
				).rejects.toThrow(
					"move the static files into a subdirectory or add a Wrangler configuration file for the Worker."
				);
			});

			it("should not throw in a non-interactive run when `functions` is a file", async ({
				expect,
			}) => {
				await seed({
					"index.html": `<h1>Hello World</h1>`,
					functions: "not a directory",
				});

				await expect(
					details.getDetailsForAutoConfig({ context: nonInteractiveContext })
				).resolves.toMatchObject({
					framework: expect.objectContaining({ id: "static" }),
					outputDir: ".",
				});
			});

			it("should not throw in a non-interactive run for a project detected as Pages through its Wrangler config", async ({
				expect,
			}) => {
				await seed({
					"index.html": `<h1>Hello World</h1>`,
					"functions/api/hello.js": pagesFunction,
				});

				await expect(
					details.getDetailsForAutoConfig({
						context: nonInteractiveContext,
						target: "wrangler",
						wranglerConfig: {
							pages_build_output_dir: process.cwd(),
						} as Config,
					})
				).resolves.toMatchObject({
					framework: expect.objectContaining({ id: "cloudflare-pages" }),
				});
			});

			it("should not throw in a non-interactive run for a project detected as Pages through the Pages cache", async ({
				expect,
			}) => {
				await seed({
					"index.html": `<h1>Hello World</h1>`,
					"functions/api/hello.js": pagesFunction,
					".wrangler/cache/pages.json": "{}",
				});
				const cachedContext = createMockContext({
					...nonInteractiveContext,
					getCacheFolder: () => join(process.cwd(), ".wrangler/cache"),
				});

				await expect(
					details.getDetailsForAutoConfig({ context: cachedContext })
				).resolves.toMatchObject({
					framework: expect.objectContaining({ id: "cloudflare-pages" }),
				});
			});

			it("should not throw in a non-interactive run when the static files are in a subdirectory", async ({
				expect,
			}) => {
				// e.g. a Firebase project: `functions/` holds server code for another
				// platform and `public/` is what gets deployed
				await seed({
					"public/index.html": `<h1>Hello World</h1>`,
					"functions/index.js": pagesFunction,
				});

				await expect(
					details.getDetailsForAutoConfig({ context: nonInteractiveContext })
				).resolves.toMatchObject({
					framework: expect.objectContaining({ id: "static" }),
					outputDir: "public",
				});
			});

			it("should not throw when an interactive user says it is not a Pages project", async ({
				expect,
			}) => {
				await seed({
					"index.html": `<h1>Hello World</h1>`,
					"functions/api/hello.js": pagesFunction,
				});
				const denyContext = createMockContext({
					dialogs: {
						confirm: vi.fn().mockResolvedValue(false),
						prompt: vi.fn().mockResolvedValue(""),
						select: vi.fn().mockResolvedValue(""),
					},
				});

				await expect(
					details.getDetailsForAutoConfig({ context: denyContext })
				).resolves.toMatchObject({
					framework: expect.objectContaining({ id: "static" }),
					outputDir: ".",
				});
			});

			it("should not throw in a non-interactive run when a framework is detected", async ({
				expect,
			}) => {
				await seed({
					"package.json": JSON.stringify({ dependencies: { astro: "5" } }),
					"index.html": `<h1>Hello World</h1>`,
					"functions/api/hello.js": pagesFunction,
				});

				await expect(
					details.getDetailsForAutoConfig({ context: nonInteractiveContext })
				).resolves.toMatchObject({
					framework: expect.objectContaining({ id: "astro" }),
				});
			});

			it("should throw in a non-interactive run when a detected framework is not recognised", async ({
				expect,
			}) => {
				await seed({
					"index.html": `<h1>Hello World</h1>`,
					"functions/api/hello.js": pagesFunction,
				});
				// A framework detected with its output in the project root but missing
				// from `allFrameworksInfos`, so it is handled as a static site and would
				// deploy the project root as assets
				vi.mocked(detectFramework).mockResolvedValueOnce({
					detectedFramework: {
						framework: { id: "gatsby", name: "Gatsby" },
						dist: ".",
					},
					packageManager: NpmPackageManager,
				});

				await expect(
					details.getDetailsForAutoConfig({ context: nonInteractiveContext })
				).rejects.toThrow(
					"looks like a Cloudflare Pages project using Pages Functions"
				);
			});
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
