import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import * as cliPackages from "@cloudflare/cli-shared-helpers/packages";
import { NpmPackageManager } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { CloudflarePages } from "../../src/frameworks/cloudflare-pages";
import { createMockContext } from "../helpers/mock-context";

const context = createMockContext();

const BASE_OPTIONS = {
	projectPath: ".",
	workerName: "my-pages-app",
	outputDir: "dist",
	dryRun: false,
	packageManager: NpmPackageManager,
	isWorkspaceRoot: false,
	context,
};

describe("Cloudflare Pages framework", () => {
	runInTempDir();

	let installSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
		installSpy = vi
			.spyOn(cliPackages, "installPackages")
			.mockImplementation(async () => {});
		await mkdir("functions", { recursive: true });
	});

	it("returns Worker configuration for compiled Pages Functions", async ({
		expect,
	}) => {
		const framework = new CloudflarePages({
			id: "cloudflare-pages",
			name: "Cloudflare Pages",
		});

		const result = await framework.configure({
			...BASE_OPTIONS,
			dryRun: true,
		});

		expect(result.wranglerConfig).toEqual({
			main: "./worker/index.js",
			assets: {
				directory: "dist",
				binding: "ASSETS",
				run_worker_first: true,
			},
			build: {
				command: "node ./scripts/build-pages-functions.mjs",
				watch_dir: ["./functions", "./worker"],
			},
		});
		expect(installSpy).not.toHaveBeenCalled();
		expect(existsSync("worker/index.js")).toBe(false);
	});

	it("installs the compiler and creates migration files", async ({
		expect,
	}) => {
		const framework = new CloudflarePages({
			id: "cloudflare-pages",
			name: "Cloudflare Pages",
		});

		await framework.configure(BASE_OPTIONS);

		expect(installSpy).toHaveBeenCalledWith(
			"npm",
			["@cloudflare/pages-functions"],
			expect.objectContaining({ dev: true, isWorkspaceRoot: false })
		);
		expect(readFileSync("worker/index.js", "utf8")).toContain(
			'import pagesFunctions from "../.wrangler/pages-functions/index.js"'
		);
		const buildScript = readFileSync(
			"scripts/build-pages-functions.mjs",
			"utf8"
		);
		expect(buildScript).toContain(
			'import { buildPagesFunctions } from "@cloudflare/pages-functions"'
		);
		expect(buildScript).toContain("assetsOutputDirectory: assetsDirectory");
		expect(buildScript).toContain('external: ["node:*", "cloudflare:*"]');
	});

	it("forwards workspace root package installation", async ({ expect }) => {
		const framework = new CloudflarePages({
			id: "cloudflare-pages",
			name: "Cloudflare Pages",
		});

		await framework.configure({ ...BASE_OPTIONS, isWorkspaceRoot: true });

		expect(installSpy).toHaveBeenCalledWith(
			"npm",
			["@cloudflare/pages-functions"],
			expect.objectContaining({ isWorkspaceRoot: true })
		);
	});

	it("rejects projects that use the project root for static assets", async ({
		expect,
	}) => {
		const framework = new CloudflarePages({
			id: "cloudflare-pages",
			name: "Cloudflare Pages",
		});

		await expect(
			framework.configure({ ...BASE_OPTIONS, outputDir: ".", dryRun: true })
		).rejects.toThrow("static asset output directory is the project root");
	});

	it("rejects environment-specific Pages configuration", async ({ expect }) => {
		const framework = new CloudflarePages({
			id: "cloudflare-pages",
			name: "Cloudflare Pages",
		});

		await expect(
			framework.configure({
				...BASE_OPTIONS,
				dryRun: true,
				existingWranglerConfig: {
					env: { production: { vars: { API_ORIGIN: "production" } } },
				},
			})
		).rejects.toThrow("environment-specific settings");
	});

	it("rejects Pages projects without a functions directory", async ({
		expect,
	}) => {
		const framework = new CloudflarePages({
			id: "cloudflare-pages",
			name: "Cloudflare Pages",
		});

		await expect(
			framework.configure({
				...BASE_OPTIONS,
				projectPath: "missing-project",
				dryRun: true,
			})
		).rejects.toThrow(
			"Only Cloudflare Pages projects with a `functions/` directory"
		);
	});

	it.each(["_routes.json", "_worker.js"])(
		"rejects projects containing %s",
		async (unsupportedFile) => {
			await mkdir("dist", { recursive: true });
			await writeFile(`dist/${unsupportedFile}`, "");
			const framework = new CloudflarePages({
				id: "cloudflare-pages",
				name: "Cloudflare Pages",
			});

			await assert.rejects(
				framework.configure({ ...BASE_OPTIONS, dryRun: true }),
				new RegExp(`${unsupportedFile}.*was found in the output directory`)
			);
		}
	);

	it.each(["worker/index.js", "scripts/build-pages-functions.mjs"])(
		"does not overwrite %s",
		async (existingFile) => {
			await mkdir(existingFile.split("/")[0], { recursive: true });
			await writeFile(existingFile, "existing");
			const framework = new CloudflarePages({
				id: "cloudflare-pages",
				name: "Cloudflare Pages",
			});

			await assert.rejects(
				framework.configure({ ...BASE_OPTIONS, dryRun: true }),
				new RegExp(`${existingFile}.*already exists`)
			);
		}
	);
});
