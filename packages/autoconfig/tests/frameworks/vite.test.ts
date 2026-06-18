import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import * as cliPackages from "@cloudflare/cli-shared-helpers/packages";
import { NpmPackageManager } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { Vite } from "../../src/frameworks/vite";
import { createMockContext } from "../helpers/mock-context";

const context = createMockContext();

const BASE_OPTIONS = {
	projectPath: ".",
	workerName: "my-vite-app",
	outputDir: "dist",
	dryRun: false,
	packageManager: NpmPackageManager,
	isWorkspaceRoot: false,
	context,
};

describe("Vite framework", () => {
	runInTempDir();

	beforeEach(() => {
		vi.spyOn(cliPackages, "installPackages").mockImplementation(async () => {});
	});

	describe("isConfigured()", () => {
		it("returns false when no vite config file exists", ({ expect }) => {
			const framework = new Vite({ id: "vite", name: "Vite" });
			expect(framework.isConfigured(".")).toBe(false);
		});
	});

	describe("configure()", () => {
		it("creates a vite config with the cloudflare plugin when no config file exists", async ({
			expect,
		}) => {
			const framework = new Vite({ id: "vite", name: "Vite" });
			const result = await framework.configure(BASE_OPTIONS);

			expect(existsSync("vite.config.js")).toBe(true);
			const content = readFileSync("vite.config.js", "utf-8");
			expect(content).toContain(
				'import { cloudflare } from "@cloudflare/vite-plugin"'
			);
			expect(content).toContain("plugins: [cloudflare()]");

			expect(result.wranglerConfig).toEqual({
				assets: {
					not_found_handling: "single-page-application",
				},
			});
		});

		it("uses .ts extension when the project has a tsconfig.json", async ({
			expect,
		}) => {
			await writeFile("tsconfig.json", "{}");

			const framework = new Vite({ id: "vite", name: "Vite" });
			await framework.configure(BASE_OPTIONS);

			expect(existsSync("vite.config.ts")).toBe(true);
			expect(existsSync("vite.config.js")).toBe(false);
		});

		it("transforms existing vite config instead of creating a new one", async ({
			expect,
		}) => {
			await writeFile(
				"vite.config.ts",
				`
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()]
});
`
			);

			const framework = new Vite({ id: "vite", name: "Vite" });
			await framework.configure(BASE_OPTIONS);

			const content = readFileSync("vite.config.ts", "utf-8");
			expect(content).toContain("cloudflare()");
			// Existing plugins should be preserved
			expect(content).toContain("react()");
		});

		it("does not create or modify files in dry-run mode", async ({
			expect,
		}) => {
			const framework = new Vite({ id: "vite", name: "Vite" });
			const result = await framework.configure({
				...BASE_OPTIONS,
				dryRun: true,
			});

			expect(existsSync("vite.config.ts")).toBe(false);
			expect(existsSync("vite.config.js")).toBe(false);
			expect(result.wranglerConfig).toEqual({
				assets: {
					not_found_handling: "single-page-application",
				},
			});
		});
	});
});
