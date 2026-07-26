import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
	getTodaysCompatDate,
	NpmPackageManager,
} from "@cloudflare/workers-utils";
import {
	mockConsoleMethods,
	runInTempDir,
	seed,
} from "@cloudflare/workers-utils/test-helpers";
import { describe, test } from "vitest";
import { Framework } from "../src/frameworks/framework-class";
import { Static } from "../src/frameworks/static";
import { runAutoConfig } from "../src/run";
import { createMockContext } from "./helpers/mock-context";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "../src/frameworks/framework-class";

/**
 * A framework whose real (non-dry-run) `configure()` writes settings straight
 * to a `wrangler.jsonc` and returns an empty `wranglerConfig`, mirroring
 * framework CLIs like Next.js via `@opennextjs/cloudflare`.
 */
class WranglerWritingFramework extends Framework {
	async configure({
		projectPath,
		dryRun,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		if (!dryRun) {
			await writeFile(
				resolve(projectPath, "wrangler.jsonc"),
				JSON.stringify({
					name: "framework-created",
					kv_namespaces: [{ binding: "FROM_FRAMEWORK", id: "abc" }],
				})
			);
		}
		// Returns nothing of its own; the real config lives in the file it wrote.
		return { wranglerConfig: {} };
	}
}

/** Read a generated config file with today's compat date stubbed for stable snapshots. */
async function readConfig(path: string): Promise<string> {
	return (await readFile(path, "utf8")).replaceAll(
		getTodaysCompatDate(),
		"<current-date>"
	);
}

describe("runAutoConfig() - new programmatic config format", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	const context = createMockContext();

	test("writes cloudflare.config.ts (not wrangler.jsonc) for a Vite project and warns about tooling", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({ name: "my-project" }),
			"vite.config.ts": "export default {};",
		});

		const summary = await runAutoConfig(
			{
				projectPath: process.cwd(),
				workerName: "my-worker",
				configured: false,
				outputDir: "dist",
				framework: new Static({ id: "static", name: "Static" }),
				packageJson: { name: "my-project" },
				packageManager: NpmPackageManager,
			},
			{
				context,
				experimentalConfigFormat: "ts",
				skipConfirmations: true,
				runBuild: false,
				enableWranglerInstallation: false,
			}
		);

		// The new config is written; no legacy wrangler.jsonc is created.
		expect(existsSync("cloudflare.config.ts")).toBe(true);
		expect(existsSync("wrangler.jsonc")).toBe(false);
		expect(existsSync("wrangler.config.ts")).toBe(false);

		// The summary's deploy/version commands are `cf`-based, consistent with
		// the generated `cf` scripts (not the default wrangler commands).
		expect(summary.deployCommand).toBe("cf deploy");
		expect(summary.versionCommand).toBe("cf versions upload");

		// A Vite project's cloudflare.config.ts imports from the vite plugin,
		// which is its build tool (not wrangler).
		expect(await readConfig("cloudflare.config.ts")).toMatchInlineSnapshot(`
			"import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";

			export default defineWorker({
				"name": "my-worker",
				"compatibilityDate": "<current-date>",
				"compatibilityFlags": [
					"nodejs_compat"
				],
				"observability": {
					"enabled": true
				}
			});
			"
		`);

		// Tooling fields (owned by Vite) are surfaced rather than dropped.
		expect(std.warn).toContain("owned by Vite");
		expect(std.warn).toContain("assetsDirectory");

		// package.json scripts are driven by `cf` in the new format.
		const pkg = JSON.parse(await readFile("package.json", "utf8"));
		expect(pkg.scripts).toEqual({
			deploy: "cf deploy",
			preview: "cf dev",
		});
	});

	test("leaves a framework-written wrangler.jsonc untouched", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({ name: "my-project" }),
			"vite.config.ts": "export default {};",
		});

		await runAutoConfig(
			{
				projectPath: process.cwd(),
				workerName: "my-worker",
				configured: false,
				outputDir: "dist",
				framework: new WranglerWritingFramework({
					id: "static",
					name: "Static",
				}),
				packageJson: { name: "my-project" },
				packageManager: NpmPackageManager,
			},
			{
				context,
				experimentalConfigFormat: "ts",
				skipConfirmations: true,
				runBuild: false,
				enableWranglerInstallation: false,
			}
		);

		// The new config is written alongside the framework's wrangler.jsonc.
		expect(existsSync("cloudflare.config.ts")).toBe(true);

		// A wrangler.jsonc written by the framework's configure() step is left
		// exactly as-is: it may not be compatible with the new format, so
		// autoconfig must not read, merge, or delete it.
		expect(existsSync("wrangler.jsonc")).toBe(true);
		const wranglerJsonc = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
		expect(wranglerJsonc).toEqual({
			name: "framework-created",
			kv_namespaces: [{ binding: "FROM_FRAMEWORK", id: "abc" }],
		});

		// The generated config comes from autoconfig's own config, not the
		// untouched framework file.
		const config = await readFile("cloudflare.config.ts", "utf8");
		expect(config).not.toContain("FROM_FRAMEWORK");
	});

	test("falls back to wrangler.jsonc when the ts format is requested for a non-Vite project", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({ name: "my-project" }),
		});

		const summary = await runAutoConfig(
			{
				projectPath: process.cwd(),
				workerName: "my-worker",
				configured: false,
				outputDir: "dist",
				framework: new Static({ id: "static", name: "Static" }),
				packageJson: { name: "my-project" },
				packageManager: NpmPackageManager,
			},
			{
				context,
				experimentalConfigFormat: "ts",
				skipConfirmations: true,
				runBuild: false,
				enableWranglerInstallation: false,
			}
		);

		// Without a Vite config, the ts format is not emitted: the project gets
		// a wrangler.jsonc and wrangler-based commands.
		expect(existsSync("wrangler.jsonc")).toBe(true);
		expect(existsSync("cloudflare.config.ts")).toBe(false);
		expect(summary.deployCommand).toContain("wrangler deploy");
	});

	test("still writes wrangler.jsonc when the config format is the default (jsonc)", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({ name: "my-project" }),
			"vite.config.ts": "export default {};",
		});

		await runAutoConfig(
			{
				projectPath: process.cwd(),
				workerName: "my-worker",
				configured: false,
				outputDir: "dist",
				framework: new Static({ id: "static", name: "Static" }),
				packageJson: { name: "my-project" },
				packageManager: NpmPackageManager,
			},
			{
				context,
				skipConfirmations: true,
				runBuild: false,
				enableWranglerInstallation: false,
			}
		);

		expect(existsSync("wrangler.jsonc")).toBe(true);
		expect(existsSync("cloudflare.config.ts")).toBe(false);
	});
});
