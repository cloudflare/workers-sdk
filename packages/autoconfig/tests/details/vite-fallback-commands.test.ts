import { execSync } from "node:child_process";
import { chmod, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { removeDir } from "@cloudflare/workers-utils";
import {
	mockConsoleMethods,
	runInTempDir,
	seed,
} from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import {
	assertProjectCommandsAvailable,
	getDetailsForAutoConfig,
} from "../../src/details";
import * as frameworkDetection from "../../src/details/framework-detection";
import { runAutoConfig } from "../../src/run";
import { createMockContext } from "../helpers/mock-context";
import type { Config } from "@cloudflare/workers-utils";

function invocation(binary: string): string {
	return process.platform === "win32"
		? `"${process.execPath}" "${binary}"`
		: `'${binary.replaceAll("'", "'\\''")}'`;
}

describe("Vite-plugin fallback commands", () => {
	runInTempDir();
	mockConsoleMethods();
	const context = createMockContext();

	async function seedProject(vitePlus = false, version = "2.0.0-beta.v.13") {
		const packageName = vitePlus ? "vite-plus" : "vite";
		const command = vitePlus ? "vp" : "vite";
		await seed({
			"package.json": JSON.stringify({
				devDependencies: {
					"@cloudflare/vite-plugin": "beta",
					...(vitePlus ? { "vite-plus": "1.5.0" } : {}),
					wrangler: "^4.136.0",
				},
			}),
			"cloudflare.config.ts": "export default {};",
			"vite.config.ts": `import { cloudflare } from '@cloudflare/vite-plugin';
export default { plugins: [cloudflare()] };`,
			"node_modules/@cloudflare/vite-plugin/package.json": JSON.stringify({
				name: "@cloudflare/vite-plugin",
				version,
			}),
			[`node_modules/${packageName}/package.json`]: JSON.stringify({
				name: packageName,
				version: "8.1.0",
				bin: { [command]: "custom cli.js" },
			}),
			[`node_modules/${packageName}/custom cli.js`]: "#!/usr/bin/env node\n",
		});
		return resolve("node_modules", packageName, "custom cli.js");
	}

	it.for([false, true])(
		"returns the installed native commands without a detected framework (Vite+: %s)",
		async (vitePlus, { expect }) => {
			const binary = await seedProject(vitePlus);
			const details = await getDetailsForAutoConfig({ context });

			expect(details).toMatchObject({
				configured: true,
				devCommand: `${invocation(binary)} dev`,
				buildCommand: `${invocation(binary)} build`,
				framework: { id: "vite", supportsMode: true },
				env: { CLOUDFLARE_VITE_FORCE_BUILD_OUTPUT: "true" },
			});
		}
	);

	it("preserves a detected framework's commands", async ({ expect }) => {
		await seedProject();
		await seed({
			"package.json": JSON.stringify({
				dependencies: { astro: "6", "@cloudflare/vite-plugin": "beta" },
			}),
		});
		const details = await getDetailsForAutoConfig({ context });

		expect(details).toMatchObject({
			devCommand: "astro dev",
			buildCommand: "astro build",
			framework: { id: "astro" },
		});
	});

	it("uses native commands for a configured unsupported framework", async ({
		expect,
	}) => {
		const binary = await seedProject();
		await seed({
			"package.json": JSON.stringify({
				dependencies: { hono: "4", "@cloudflare/vite-plugin": "beta" },
				scripts: { dev: "cf dev", build: "cf build" },
			}),
		});
		const details = await getDetailsForAutoConfig({ context });

		expect(details.devCommand).toBe(`${invocation(binary)} dev`);
		expect(details.buildCommand).toBe(`${invocation(binary)} build`);
	});

	it("can plan setup for an undetected project before the plugin is configured", async ({
		expect,
	}) => {
		const binary = await seedProject();
		await rm("cloudflare.config.ts");
		await rm("vite.config.ts");
		const details = await getDetailsForAutoConfig({ context });

		expect(details).toMatchObject({
			configured: false,
			framework: { id: "vite" },
			devCommand: `${invocation(binary)} dev`,
			buildCommand: `${invocation(binary)} build`,
			outputDir: "dist",
			commandError: undefined,
		});
	});

	it.for(["config", "cache", "functions"] as const)(
		"preserves Pages detected from %s instead of migrating it through Vite",
		async (detection, { expect }) => {
			await seedProject();
			await rm("cloudflare.config.ts");
			await rm("vite.config.ts");
			const cacheFolder = resolve(".cache");
			await seed({
				"public/index.html": "<h1>Pages</h1>",
				...(detection === "cache" ? { ".cache/pages.json": "{}" } : {}),
				...(detection === "functions"
					? { "functions/hello.js": "export function onRequest() {}" }
					: {}),
			});
			const pagesContext = createMockContext({
				getCacheFolder: () => cacheFolder,
			});
			const options = {
				context: pagesContext,
				...(detection === "config"
					? { wranglerConfig: { pages_build_output_dir: "public" } as Config }
					: {}),
			};
			const details = await getDetailsForAutoConfig(options);

			expect(details).toMatchObject({
				configured: false,
				framework: { id: "cloudflare-pages" },
				outputDir: "public",
				devCommand: undefined,
				buildCommand: undefined,
				env: undefined,
			});
			await expect(
				runAutoConfig(details, {
					target: "cf",
					context: pagesContext,
					dryRun: true,
				})
			).rejects.toThrow(
				"Automatically migrating from a Pages project to Workers is not yet supported"
			);

			await removeDir("node_modules");
			await expect(getDetailsForAutoConfig(options)).resolves.toMatchObject({
				framework: { id: "cloudflare-pages" },
				devCommand: undefined,
				buildCommand: undefined,
			});
		}
	);

	it("preserves Pages detection even with a Cloudflare config", async ({
		expect,
	}) => {
		await seedProject();
		const details = await getDetailsForAutoConfig({
			context,
			wranglerConfig: { pages_build_output_dir: "public" } as Config,
		});

		expect(details).toMatchObject({
			configured: true,
			framework: { id: "cloudflare-pages" },
			devCommand: undefined,
			buildCommand: undefined,
		});
	});

	it("retains the non-interactive guard for Pages Functions with root assets", async ({
		expect,
	}) => {
		await seedProject();
		await rm("cloudflare.config.ts");
		await rm("vite.config.ts");
		await seed({
			"index.html": "<h1>Pages</h1>",
			"functions/hello.js": "export function onRequest() {}",
		});
		const ciContext = createMockContext({ isNonInteractiveOrCI: () => true });
		ciContext.dialogs.confirm = async () => false;

		await expect(
			getDetailsForAutoConfig({ context: ciContext })
		).rejects.toThrow(
			"Automatic configuration cannot migrate Pages Functions to Workers yet"
		);
	});

	it.for([
		["hono", "hono", "4"],
		["hydrogen", "@shopify/hydrogen", "2026.1.0"],
	] as const)(
		"does not auto-configure unsupported %s through Vite",
		async ([id, pkg, version], { expect }) => {
			await seedProject();
			await rm("cloudflare.config.ts");
			await seed({
				"package.json": JSON.stringify({
					dependencies: { [pkg]: version, "@cloudflare/vite-plugin": "beta" },
				}),
				"public/index.html": "<h1>Unsupported framework</h1>",
			});
			const details = await getDetailsForAutoConfig({ context });

			expect(details).toMatchObject({
				configured: false,
				framework: { id },
				devCommand: undefined,
				buildCommand: undefined,
			});
			await expect(
				runAutoConfig(details, { target: "cf", context, dryRun: true })
			).rejects.toThrow("cannot be automatically configured");
		}
	);

	it.for([
		["angular", "@angular/cli", "22"],
		["nuxt", "nuxt", "4"],
	] as const)(
		"retains the cf support check for %s",
		async ([id, pkg, version], { expect }) => {
			await seedProject();
			await rm("cloudflare.config.ts");
			await seed({
				"package.json": JSON.stringify({
					dependencies: { [pkg]: version, "@cloudflare/vite-plugin": "beta" },
				}),
				"public/index.html": "<h1>Wrangler-only framework</h1>",
			});
			const details = await getDetailsForAutoConfig({ context });

			expect(details.framework.id).toBe(id);
			await expect(
				runAutoConfig(details, { target: "cf", context, dryRun: true })
			).rejects.toThrow("You can still use Wrangler");
		}
	);

	it("does not replace an unconfigured unknown framework with Vite", async ({
		expect,
	}) => {
		await seedProject();
		await rm("cloudflare.config.ts");
		await seed({
			"package.json": JSON.stringify({
				dependencies: { gatsby: "5", "@cloudflare/vite-plugin": "beta" },
			}),
			"public/index.html": "<h1>Gatsby</h1>",
		});
		const details = await getDetailsForAutoConfig({ context });

		expect(details).toMatchObject({
			configured: false,
			framework: { id: "static" },
			devCommand: undefined,
			buildCommand: undefined,
		});
	});

	it.for([
		"1.61.0",
		"2.0.0-beta.1",
		"2.0.0-beta.v.12",
		"2.0.0-beta.v.12+build.100",
		"3.0.0-beta.1",
		"invalid",
	])(
		"reports an incompatible plugin %s without failing detection",
		async (version, { expect }) => {
			await seedProject(false, version);
			const details = await getDetailsForAutoConfig({ context });
			expect(details.commandError?.code).toBe("vite-plugin-incompatible");
			expect(() => assertProjectCommandsAvailable(details)).toThrow(
				"cf requires @cloudflare/vite-plugin >=2.0.0-beta.v.13 <3"
			);
		}
	);

	it("does not take an executable from a parent project", async ({
		expect,
	}) => {
		await seedProject();
		await seed({
			"child/package.json": JSON.stringify({
				devDependencies: { "@cloudflare/vite-plugin": "beta" },
			}),
			"child/cloudflare.config.ts": "export default {};",
			"child/node_modules/@cloudflare/vite-plugin/package.json": JSON.stringify(
				{
					name: "@cloudflare/vite-plugin",
					version: "2.0.0-beta.v.13",
				}
			),
		});

		const details = await getDetailsForAutoConfig({
			projectPath: resolve("child"),
			context,
		});
		expect(details.commandError?.code).toBe("vite-tool-not-installed");
		expect(details.nodeModulesPaths).toEqual([resolve("child/node_modules")]);
	});

	it("does not take the plugin from a parent project", async ({ expect }) => {
		await seedProject();
		await seed({
			"child/package.json": JSON.stringify({
				devDependencies: { "@cloudflare/vite-plugin": "beta" },
			}),
			"child/cloudflare.config.ts": "export default {};",
		});

		const details = await getDetailsForAutoConfig({
			projectPath: resolve("child"),
			context,
		});
		expect(details.commandError?.code).toBe("vite-plugin-not-installed");
		expect(details.configured).toBe(true);
		expect(details.devCommand).toBeUndefined();
	});

	it("reports which Vite+ tool needs installing", async ({ expect }) => {
		await seed({
			"package.json": JSON.stringify({
				devDependencies: {
					"@cloudflare/vite-plugin": "beta",
					"vite-plus": "1",
				},
			}),
			"node_modules/@cloudflare/vite-plugin/package.json": JSON.stringify({
				version: "2.0.0-beta.v.13",
			}),
		});

		const details = await getDetailsForAutoConfig({ context });
		expect(details.commandError?.message).toContain(
			"npm install --save-dev @cloudflare/vite-plugin@beta vite-plus"
		);
	});

	it.for([false, true])(
		"resolves hoisted workspace tools (Vite+: %s)",
		async (vitePlus, { expect }) => {
			const binary = await seedProject(vitePlus);
			await seed({
				"package.json": JSON.stringify({ workspaces: ["apps/*"] }),
				"apps/site/package.json": JSON.stringify({
					name: "site",
					devDependencies: {
						"@cloudflare/vite-plugin": "beta",
						...(vitePlus ? { "vite-plus": "1.5.0" } : {}),
					},
				}),
				"apps/site/cloudflare.config.ts": "export default {};",
				"apps/site/vite.config.ts": `import { cloudflare } from '@cloudflare/vite-plugin'; export default { plugins: [cloudflare()] };`,
			});
			const details = await getDetailsForAutoConfig({
				projectPath: resolve("apps/site"),
				context,
			});
			expect(details.commandError).toBeUndefined();
			expect(details.buildCommand).toBe(`${invocation(binary)} build`);
			expect(details.nodeModulesPaths).toEqual([
				resolve("apps/site/node_modules"),
				resolve("apps/node_modules"),
				resolve("node_modules"),
			]);
		}
	);

	it("does not use a workspace that excludes the application", async ({
		expect,
	}) => {
		await seedProject();
		await seed({
			"package.json": JSON.stringify({ workspaces: ["other/*"] }),
			"apps/site/package.json": JSON.stringify({
				devDependencies: { "@cloudflare/vite-plugin": "beta" },
			}),
			"apps/site/cloudflare.config.ts": "export default {};",
		});
		const details = await getDetailsForAutoConfig({
			projectPath: resolve("apps/site"),
			context,
		});
		expect(details.commandError?.code).toBe("vite-plugin-not-installed");
		expect(details.nodeModulesPaths).toEqual([
			resolve("apps/site/node_modules"),
		]);
	});

	it("prefers the application's tool over a hoisted tool", async ({
		expect,
	}) => {
		await seedProject();
		await seed({
			"package.json": JSON.stringify({ workspaces: ["apps/*"] }),
			"apps/site/package.json": JSON.stringify({
				devDependencies: { "@cloudflare/vite-plugin": "beta" },
			}),
			"apps/site/cloudflare.config.ts": "export default {};",
			"apps/site/vite.config.ts": `import { cloudflare } from '@cloudflare/vite-plugin'; export default { plugins: [cloudflare()] };`,
			"apps/site/node_modules/vite/package.json": JSON.stringify({
				bin: { vite: "local.js" },
			}),
			"apps/site/node_modules/vite/local.js": "#!/usr/bin/env node\n",
		});
		const details = await getDetailsForAutoConfig({
			projectPath: resolve("apps/site"),
			context,
		});
		expect(details.buildCommand).toBe(
			`${invocation(resolve("apps/site/node_modules/vite/local.js"))} build`
		);
	});

	it("checks plugin compatibility for canonical framework commands too", async ({
		expect,
	}) => {
		await seedProject(false, "1.0.0");
		await seed({
			"package.json": JSON.stringify({
				dependencies: { astro: "6", "@cloudflare/vite-plugin": "beta" },
			}),
		});
		const details = await getDetailsForAutoConfig({ context });
		expect(details.framework?.id).toBe("astro");
		expect(() => assertProjectCommandsAvailable(details)).toThrow(
			"cf requires @cloudflare/vite-plugin >=2.0.0-beta.v.13 <3"
		);
	});

	it.for([
		undefined,
		"export default { plugins: [] };",
		"export default { plugins: [cloudflare()].filter(Boolean) };",
		"const plugins = [cloudflare()]; export default { plugins };",
		"export default mergeConfig(base, { plugins: [cloudflare()] });",
		"export default vite.defineConfig({ plugins: [cloudflare()] });",
		"throw new Error('Config must not be executed during detection');",
		"invalid config syntax {{",
	])("leaves config evaluation to Vite: %s", async (config, { expect }) => {
		const binary = await seedProject();
		if (config === undefined) {
			await rm("vite.config.ts");
		} else {
			await seed({ "vite.config.ts": config });
		}
		const details = await getDetailsForAutoConfig({ context });
		expect(details.commandError).toBeUndefined();
		expect(details.devCommand).toBe(`${invocation(binary)} dev`);
		expect(details.buildCommand).toBe(`${invocation(binary)} build`);
	});

	it("preserves canonical Vite commands with a dynamic config", async ({
		expect,
	}) => {
		await seedProject();
		await seed({
			"package.json": JSON.stringify({
				devDependencies: { vite: "8.1.0", "@cloudflare/vite-plugin": "beta" },
			}),
			"vite.config.ts":
				"export default vite.defineConfig({ plugins: [cloudflare()].filter(Boolean) });",
		});
		const details = await getDetailsForAutoConfig({ context });
		expect(details.commandError).toBeUndefined();
		expect(details.devCommand).toBe("vite");
		expect(details.buildCommand).toBe("vite build");
	});

	it.for([
		"2.0.0-beta.v.13",
		"2.0.0-beta.v.14",
		"2.0.0-beta.v.100+build.1",
		"2.0.0",
		"2.1.0-alpha.1",
	])(
		"accepts plugin %s with cf profile support",
		async (version, { expect }) => {
			await seedProject(false, version);
			const details = await getDetailsForAutoConfig({ context });
			expect(details.commandError).toBeUndefined();
		}
	);

	it("retains configured project details before dependencies are installed", async ({
		expect,
	}) => {
		await seedProject();
		await removeDir("node_modules");
		const details = await getDetailsForAutoConfig({ context });
		expect(details.configured).toBe(true);
		expect(details.commandError?.code).toBe("vite-plugin-not-installed");
		expect(details.devCommand).toBeUndefined();
		expect(details.buildCommand).toBeUndefined();
	});

	it.for(["devCommand", "buildCommand"] as const)(
		"preserves partial framework commands when %s is absent",
		async (missing, { expect }) => {
			await seedProject();
			await seed({
				"package.json": JSON.stringify({
					dependencies: { astro: "6", "@cloudflare/vite-plugin": "beta" },
				}),
			});
			const detected = await frameworkDetection.detectFramework(
				process.cwd(),
				context,
				{ target: "cf" }
			);
			vi.spyOn(frameworkDetection, "detectFramework").mockResolvedValue({
				...detected,
				detectedFramework: {
					...detected.detectedFramework,
					[missing]: undefined,
				},
			});
			const details = await getDetailsForAutoConfig({ context });
			expect(details.framework?.id).toBe("astro");
			expect(details.env).toEqual(detected.detectedFramework.framework.env);
			expect(details[missing]).toBeUndefined();
			expect(
				details[missing === "devCommand" ? "buildCommand" : "devCommand"]
			).toBe(missing === "devCommand" ? "astro build" : "astro dev");
		}
	);

	it.for([false, true])(
		"executes native commands through the platform shell (Vite+: %s)",
		async (vitePlus, { expect }) => {
			const binary = await seedProject(vitePlus);
			await seed({
				[binary]:
					"#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)));",
			});
			await chmod(binary, 0o755);
			const details = await getDetailsForAutoConfig({ context });
			if (!details.buildCommand) {
				throw new Error("Expected a runnable build command");
			}
			// Exercise the shell contract used by Wrangler's runCommand, including cmd.exe on Windows.
			expect(execSync(details.buildCommand, { encoding: "utf8" })).toBe(
				'["build"]'
			);
		}
	);

	it("does not add commands for Wrangler static projects", async ({
		expect,
	}) => {
		await seedProject();
		await rm("vite.config.ts");
		await seed({ "public/index.html": "<h1>Static</h1>" });
		const details = await getDetailsForAutoConfig({
			target: "wrangler",
			context,
		});

		expect(details.devCommand).toBeUndefined();
		expect(details.buildCommand).toBeUndefined();
	});

	it("does not replace an explicit assets-directory workflow", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({
				devDependencies: { "@cloudflare/vite-plugin": "beta" },
			}),
			"public/index.html": "<h1>Static</h1>",
		});
		const details = await getDetailsForAutoConfig({
			outputDir: join(process.cwd(), "public"),
			context,
		});

		expect(details.devCommand).toBeUndefined();
		expect(details.buildCommand).toBeUndefined();
	});
});
