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
 * A framework whose real (non-dry-run) `configure()` writes its own
 * `wrangler.jsonc`, mirroring framework CLIs that emit one during setup.
 */
class WranglerWritingFramework extends Framework {
	async configure({
		outputDir,
		projectPath,
		dryRun,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		if (!dryRun) {
			await writeFile(
				resolve(projectPath, "wrangler.jsonc"),
				JSON.stringify({ name: "framework-created" })
			);
		}
		return { wranglerConfig: { assets: { directory: outputDir } } };
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

	test("creates cloudflare.config.ts and wrangler.config.ts for a non-Vite project", async ({
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

		// No legacy wrangler.jsonc is written in ts mode.
		expect(existsSync("wrangler.jsonc")).toBe(false);

		// The summary's deploy/version commands are `cf`-based, consistent with
		// the generated `cf` scripts (not the default wrangler commands).
		expect(summary.deployCommand).toBe("cf deploy");
		expect(summary.versionCommand).toBe("cf versions upload");

		// Runtime config (cloudflare.config.ts) is always written.
		expect(await readConfig("cloudflare.config.ts")).toMatchInlineSnapshot(`
			"import { defineWorker } from "wrangler/experimental-config";

			export default defineWorker({
				name: "my-worker",
				compatibilityDate: "<current-date>",
				compatibilityFlags: [
					"nodejs_compat",
				],
				observability: {
					enabled: true,
				},
			});
			"
		`);

		// Tooling config (wrangler.config.ts) is written for non-Vite projects:
		// the assets directory lives there, not in the runtime config.
		expect(await readConfig("wrangler.config.ts")).toMatchInlineSnapshot(`
			"import { defineWranglerConfig } from "wrangler/experimental-config";

			export default defineWranglerConfig({
				assetsDirectory: "dist",
			});
			"
		`);

		// package.json scripts are driven by `cf` in the new format.
		const pkg = JSON.parse(await readFile("package.json", "utf8"));
		expect(pkg.scripts).toEqual({
			deploy: "cf deploy",
			preview: "cf dev",
		});
	});

	test("creates only cloudflare.config.ts for a Vite project and warns about tooling", async ({
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
				experimentalConfigFormat: "ts",
				skipConfirmations: true,
				runBuild: false,
				enableWranglerInstallation: false,
			}
		);

		// Vite owns tooling, so only the runtime config is written.
		expect(existsSync("cloudflare.config.ts")).toBe(true);
		expect(existsSync("wrangler.config.ts")).toBe(false);
		expect(existsSync("wrangler.jsonc")).toBe(false);

		// The tooling fields that have nowhere to go are surfaced rather than dropped.
		expect(std.warn).toContain("owned by Vite");
		expect(std.warn).toContain("assetsDirectory");
	});

	test("migrating: removes a pre-existing wrangler.jsonc when writing the new format", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({ name: "my-project" }),
			"wrangler.jsonc": JSON.stringify({
				name: "old-worker",
				compatibility_date: "2024-01-01",
			}),
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
				experimentalConfigFormat: "ts",
				skipConfirmations: true,
				runBuild: false,
				enableWranglerInstallation: false,
			}
		);

		// The pre-existing wrangler.jsonc is removed as part of the migration.
		expect(existsSync("wrangler.jsonc")).toBe(false);
		expect(existsSync("cloudflare.config.ts")).toBe(true);
	});

	test("still writes wrangler.jsonc when the config format is the default (jsonc)", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({ name: "my-project" }),
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
		expect(existsSync("wrangler.config.ts")).toBe(false);
	});

	test("removes a wrangler.jsonc created by the framework's configure() step", async ({
		expect,
	}) => {
		// No pre-existing wrangler config: the framework writes one during setup.
		await seed({
			"package.json": JSON.stringify({ name: "my-project" }),
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

		// The framework-created wrangler.jsonc must not be left behind alongside
		// the new programmatic config.
		expect(existsSync("wrangler.jsonc")).toBe(false);
		expect(existsSync("cloudflare.config.ts")).toBe(true);
	});
});
