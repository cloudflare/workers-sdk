import { join, resolve } from "node:path";
import {
	mockConsoleMethods,
	runInTempDir,
	seed,
} from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { getDetailsForAutoConfig } from "../../src/details";
import { createMockContext } from "../helpers/mock-context";

describe("Vite-plugin fallback commands", () => {
	runInTempDir();
	mockConsoleMethods();
	const context = createMockContext();

	async function seedProject(vitePlus = false, version = "2.0.0-beta.1") {
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
				devCommand: `'${binary}' dev`,
				buildCommand: `'${binary}' build`,
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

		expect(details.devCommand).toBe(`'${binary}' dev`);
		expect(details.buildCommand).toBe(`'${binary}' build`);
	});

	it.for(["1.61.0", "3.0.0-beta.1", "invalid"])(
		"rejects an incompatible plugin %s",
		async (version, { expect }) => {
			await seedProject(false, version);
			await expect(getDetailsForAutoConfig({ context })).rejects.toThrow(
				"cf requires @cloudflare/vite-plugin v2 beta"
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
					version: "2.0.0-beta.1",
				}
			),
		});

		await expect(
			getDetailsForAutoConfig({ projectPath: resolve("child"), context })
		).rejects.toThrow("project's vite executable could not be found");
	});

	it("does not take the plugin from a parent project", async ({ expect }) => {
		await seedProject();
		await seed({
			"child/package.json": JSON.stringify({
				devDependencies: { "@cloudflare/vite-plugin": "beta" },
			}),
			"child/cloudflare.config.ts": "export default {};",
		});

		await expect(
			getDetailsForAutoConfig({ projectPath: resolve("child"), context })
		).rejects.toThrow(
			"@cloudflare/vite-plugin is declared in package.json but is not installed"
		);
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
				version: "2.0.0-beta.1",
			}),
		});

		await expect(getDetailsForAutoConfig({ context })).rejects.toThrow(
			"npm install --save-dev @cloudflare/vite-plugin@beta vite-plus"
		);
	});

	it("does not add commands for Wrangler static projects", async ({
		expect,
	}) => {
		await seedProject();
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
