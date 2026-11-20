import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as cliCommand from "@cloudflare/cli-shared-helpers/command";
import * as cliPackages from "@cloudflare/cli-shared-helpers/packages";
import { NpmPackageManager } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { AutoConfigFrameworkConfigurationError } from "../../src/errors";
import { Astro } from "../../src/frameworks/astro";
import { createMockContext } from "../helpers/mock-context";

const context = createMockContext();

function createFramework(version: string): Astro {
	const framework = new Astro({ id: "astro", name: "Astro" });
	vi.spyOn(framework, "frameworkVersion", "get").mockReturnValue(version);
	return framework;
}

function getOptions(
	projectPath: string,
	{
		target = "cf",
		dryRun = false,
	}: { target?: "cf" | "wrangler"; dryRun?: boolean } = {}
) {
	return {
		target,
		projectPath,
		workerName: "my-astro-app",
		outputDir: "dist",
		dryRun,
		packageManager: NpmPackageManager,
		isWorkspaceRoot: false,
		context,
	};
}

describe("Astro framework", () => {
	runInTempDir();

	beforeEach(() => {
		vi.spyOn(cliCommand, "runCommand").mockImplementation(async () => "");
		vi.spyOn(cliPackages, "installPackages").mockImplementation(async () => {});
	});

	it.for(["7.3.5", "7.0.0-beta.2"])(
		"configures Astro %s for cf",
		async (version, { expect }) => {
			const projectPath = process.cwd();

			const result = await createFramework(version).configure(
				getOptions(projectPath)
			);

			expect(cliPackages.installPackages).not.toHaveBeenCalled();
			expect(cliCommand.runCommand).toHaveBeenCalledWith(
				["npx", "astro@beta", "add", "@astrojs/cloudflare@beta", "-y"],
				expect.objectContaining({ cwd: projectPath })
			);
			expect(existsSync(join(projectPath, "public", ".assetsignore"))).toBe(
				false
			);
			expect(result).toEqual({ workerConfig: null });
		}
	);

	it("installs nothing in a dry run for cf", async ({ expect }) => {
		const result = await createFramework("7.3.5").configure(
			getOptions(process.cwd(), { dryRun: true })
		);

		expect(cliPackages.installPackages).not.toHaveBeenCalled();
		expect(cliCommand.runCommand).not.toHaveBeenCalled();
		expect(result).toEqual({ workerConfig: null });
	});

	describe("with the project's own Worker entrypoint", () => {
		beforeEach(() => {
			writeFileSync(
				"astro.config.mjs",
				'import { defineConfig } from "astro/config";\nexport default defineConfig({ output: "static" });\n'
			);
			mkdirSync("worker");
		});

		it("switches to server output and explains the Worker hand-off", async ({
			expect,
		}) => {
			writeFileSync("worker/index.ts", "return env.ASSETS.fetch(request);");

			await createFramework("7.4.12").configure({
				...getOptions(process.cwd()),
				existingWorkerConfig: { entrypoint: "worker/index.ts" },
			});

			expect(readFileSync("astro.config.mjs", "utf-8")).toContain(
				'output: "server"'
			);
			expect(context.logger.warn).toHaveBeenCalledWith(
				[
					'Switched the Astro config to `output: "server"`: `worker/index.ts` is this project\'s own Worker, and the Cloudflare adapter leaves it out of static builds.',
					"Astro now renders pages on request, so pass the requests your Worker doesn't handle to Astro:",
					'  import astro from "@astrojs/cloudflare/entrypoints/server";',
					"  return astro.fetch(request, env, ctx);",
					"Add `export const prerender = true` to pages that should stay static files.",
				].join("\n")
			);
		});

		it("skips the hand-off when the Worker already uses Astro", async ({
			expect,
		}) => {
			writeFileSync(
				"worker/index.ts",
				'import astro from "@astrojs/cloudflare/entrypoints/server";'
			);

			await createFramework("7.4.12").configure({
				...getOptions(process.cwd()),
				existingWorkerConfig: { entrypoint: "worker/index.ts" },
			});

			expect(context.logger.warn).toHaveBeenCalledWith(
				expect.not.stringContaining("astro.fetch")
			);
		});

		it("keeps static output for the adapter's own entrypoint", async ({
			expect,
		}) => {
			await createFramework("7.4.12").configure({
				...getOptions(process.cwd()),
				existingWorkerConfig: {
					entrypoint: "@astrojs/cloudflare/entrypoints/server",
				},
			});

			expect(readFileSync("astro.config.mjs", "utf-8")).toContain(
				'output: "static"'
			);
			expect(context.logger.warn).not.toHaveBeenCalled();
		});
	});

	it("configures Astro 6 or later for Wrangler with `astro add cloudflare`", async ({
		expect,
	}) => {
		const projectPath = process.cwd();
		mkdirSync(join(projectPath, "public"));

		const result = await createFramework("6.0.0").configure(
			getOptions(projectPath, { target: "wrangler" })
		);

		expect(cliCommand.runCommand).toHaveBeenCalledWith(
			["npx", "astro", "add", "cloudflare", "-y"],
			expect.anything()
		);
		expect(cliPackages.installPackages).not.toHaveBeenCalled();
		expect(existsSync(join(projectPath, "public", ".assetsignore"))).toBe(true);
		expect(result).toEqual({ workerConfig: null });
	});

	it("keeps the Wrangler configuration for Astro 5", async ({ expect }) => {
		const result = await createFramework("5.0.0").configure(
			getOptions(process.cwd(), { target: "wrangler", dryRun: true })
		);

		expect(result).toEqual({
			buildTool: "wrangler",
			workerConfig: {
				entrypoint: "dist/_worker.js/index.js",
				compatibilityFlags: ["global_fetch_strictly_public"],
				env: { ASSETS: { type: "assets" } },
			},
			buildConfig: { assetsDirectory: "dist" },
		});
	});

	it("requires Astro 7 before configuring for cf", async ({ expect }) => {
		const projectPath = process.cwd();
		const configuration = createFramework("6.0.0").configure(
			getOptions(projectPath)
		);

		await expect(configuration).rejects.toThrow(
			AutoConfigFrameworkConfigurationError
		);
		await expect(configuration).rejects.toThrow(
			'cf only supports Astro 7 or later, but this project uses Astro "6.0.0". Please update Astro and try again, or continue using Wrangler if you are not ready to upgrade.'
		);
		expect(cliPackages.installPackages).not.toHaveBeenCalled();
	});
});
