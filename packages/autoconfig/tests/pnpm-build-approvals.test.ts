import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as cliPackages from "@cloudflare/cli-shared-helpers/packages";
import {
	NpmPackageManager,
	PnpmPackageManager,
} from "@cloudflare/workers-utils";
import {
	mockConsoleMethods,
	runInTempDir,
	seed,
} from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { Static } from "../src/frameworks/static";
import { runAutoConfig } from "../src/run";
import { createMockContext } from "./helpers/mock-context";

/**
 * pnpm 11+ aborts an install whose dependencies need unapproved build
 * scripts with `ERR_PNPM_IGNORED_BUILDS`. When autoconfig installs the
 * Cloudflare CLI or Wrangler with pnpm, it must first add `allowBuilds`
 * approvals for the Cloudflare packages it installs that need build scripts
 * (`workerd` and `esbuild`) to the active workspace's `pnpm-workspace.yaml`.
 */
describe("runAutoConfig() pnpm build approvals", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	const EXISTING_WORKSPACE_YAML = "packages:\n  - '.'\n";

	it("approves workerd and esbuild builds in the active workspace before installing cf", async ({
		expect,
	}) => {
		let workspaceYamlAtInstall: string | undefined;
		const installPackages = vi
			.spyOn(cliPackages, "installPackages")
			.mockImplementation(async () => {
				workspaceYamlAtInstall = readFileSync(
					"pnpm-workspace.yaml",
					"utf8"
				);
			});
		vi.spyOn(cliPackages, "installWrangler").mockResolvedValue();
		const packageJson = { name: "my-static-app" };
		await seed({
			"package.json": JSON.stringify(packageJson),
			"pnpm-workspace.yaml": EXISTING_WORKSPACE_YAML,
			"public/index.html": "<h1>Hello World</h1>",
		});

		await runAutoConfig(
			{
				configured: false,
				projectPath: process.cwd(),
				workerName: "my-static-app",
				framework: new Static({ id: "static", name: "Static" }),
				outputDir: "public",
				packageJson,
				packageManager: PnpmPackageManager,
			},
			{
				target: "cf",
				context: createMockContext(),
				skipConfirmations: true,
				runBuild: false,
			}
		);

		expect(installPackages).toHaveBeenCalledWith("pnpm", ["cf@latest"], {
			dev: true,
			isWorkspaceRoot: false,
		});
		// The approvals must already be in place when the first install runs.
		expect(workspaceYamlAtInstall).toMatch(/allowBuilds:/);
		expect(workspaceYamlAtInstall).toMatch(/workerd:\s*true/);
		expect(workspaceYamlAtInstall).toMatch(/esbuild:\s*true/);
		const finalYaml = readFileSync("pnpm-workspace.yaml", "utf8");
		// Existing workspace settings are preserved.
		expect(finalYaml).toContain("packages:");
	});

	it("approves workerd and esbuild builds in the active workspace before installing Wrangler", async ({
		expect,
	}) => {
		let workspaceYamlAtInstall: string | undefined;
		const installWrangler = vi
			.spyOn(cliPackages, "installWrangler")
			.mockImplementation(async () => {
				workspaceYamlAtInstall = readFileSync(
					"pnpm-workspace.yaml",
					"utf8"
				);
			});
		const packageJson = { name: "my-static-app" };
		await seed({
			"package.json": JSON.stringify(packageJson),
			"pnpm-workspace.yaml": EXISTING_WORKSPACE_YAML,
			"public/index.html": "<h1>Hello World</h1>",
		});

		await runAutoConfig(
			{
				configured: false,
				projectPath: process.cwd(),
				workerName: "my-static-app",
				framework: new Static({ id: "static", name: "Static" }),
				outputDir: "public",
				packageJson,
				packageManager: PnpmPackageManager,
			},
			{
				target: "wrangler",
				context: createMockContext(),
				skipConfirmations: true,
				runBuild: false,
			}
		);

		expect(installWrangler).toHaveBeenCalledWith("pnpm", false);
		expect(workspaceYamlAtInstall).toMatch(/allowBuilds:/);
		expect(workspaceYamlAtInstall).toMatch(/workerd:\s*true/);
		expect(workspaceYamlAtInstall).toMatch(/esbuild:\s*true/);
	});

	it("preserves existing allowBuilds entries and explicit denials", async ({
		expect,
	}) => {
		vi.spyOn(cliPackages, "installPackages").mockResolvedValue();
		vi.spyOn(cliPackages, "installWrangler").mockResolvedValue();
		const packageJson = { name: "my-static-app" };
		await seed({
			"package.json": JSON.stringify(packageJson),
			"pnpm-workspace.yaml": [
				"packages:",
				"  - '.'",
				"allowBuilds:",
				"  sharp: true",
				"  workerd: false",
				"",
			].join("\n"),
			"public/index.html": "<h1>Hello World</h1>",
		});

		await runAutoConfig(
			{
				configured: false,
				projectPath: process.cwd(),
				workerName: "my-static-app",
				framework: new Static({ id: "static", name: "Static" }),
				outputDir: "public",
				packageJson,
				packageManager: PnpmPackageManager,
			},
			{
				target: "cf",
				context: createMockContext(),
				skipConfirmations: true,
				runBuild: false,
			}
		);

		const finalYaml = readFileSync("pnpm-workspace.yaml", "utf8");
		// Other approvals are kept, explicit `false` decisions are not flipped.
		expect(finalYaml).toMatch(/sharp:\s*true/);
		expect(finalYaml).toMatch(/workerd:\s*false/);
		expect(finalYaml).toMatch(/esbuild:\s*true/);
		expect(finalYaml).toContain("packages:");
	});

	it("updates the root workspace file for a project inside a pnpm workspace", async ({
		expect,
	}) => {
		vi.spyOn(cliPackages, "installPackages").mockResolvedValue();
		vi.spyOn(cliPackages, "installWrangler").mockResolvedValue();
		const packageJson = { name: "my-static-app" };
		await seed({
			"pnpm-workspace.yaml": EXISTING_WORKSPACE_YAML,
			"apps/existing-project/package.json": JSON.stringify(packageJson),
			"apps/existing-project/public/index.html":
				"<h1>Hello World</h1>",
		});

		await runAutoConfig(
			{
				configured: false,
				projectPath: resolve(process.cwd(), "apps/existing-project"),
				workerName: "my-static-app",
				framework: new Static({ id: "static", name: "Static" }),
				outputDir: "public",
				packageJson,
				packageManager: PnpmPackageManager,
			},
			{
				target: "cf",
				context: createMockContext(),
				skipConfirmations: true,
				runBuild: false,
			}
		);

		// The active (root) workspace file gains the approvals...
		const rootYaml = readFileSync("pnpm-workspace.yaml", "utf8");
		expect(rootYaml).toMatch(/allowBuilds:/);
		expect(rootYaml).toMatch(/workerd:\s*true/);
		expect(rootYaml).toMatch(/esbuild:\s*true/);
		// ...and no project-level workspace file is created.
		expect(
			existsSync("apps/existing-project/pnpm-workspace.yaml")
		).toBe(false);
	});

	it("respects dangerouslyAllowAllBuilds instead of adding a conflicting policy", async ({
		expect,
	}) => {
		vi.spyOn(cliPackages, "installPackages").mockResolvedValue();
		vi.spyOn(cliPackages, "installWrangler").mockResolvedValue();
		const packageJson = { name: "my-static-app" };
		await seed({
			"package.json": JSON.stringify(packageJson),
			"pnpm-workspace.yaml": "dangerouslyAllowAllBuilds: true\n",
			"public/index.html": "<h1>Hello World</h1>",
		});

		await runAutoConfig(
			{
				configured: false,
				projectPath: process.cwd(),
				workerName: "my-static-app",
				framework: new Static({ id: "static", name: "Static" }),
				outputDir: "public",
				packageJson,
				packageManager: PnpmPackageManager,
			},
			{
				target: "cf",
				context: createMockContext(),
				skipConfirmations: true,
				runBuild: false,
			}
		);

		expect(readFileSync("pnpm-workspace.yaml", "utf8")).toBe(
			"dangerouslyAllowAllBuilds: true\n"
		);
	});

	it("does not write build approvals during a dry run", async ({
		expect,
	}) => {
		vi.spyOn(cliPackages, "installPackages").mockResolvedValue();
		vi.spyOn(cliPackages, "installWrangler").mockResolvedValue();
		const packageJson = { name: "my-static-app" };
		await seed({
			"package.json": JSON.stringify(packageJson),
			"pnpm-workspace.yaml": EXISTING_WORKSPACE_YAML,
			"public/index.html": "<h1>Hello World</h1>",
		});

		await runAutoConfig(
			{
				configured: false,
				projectPath: process.cwd(),
				workerName: "my-static-app",
				framework: new Static({ id: "static", name: "Static" }),
				outputDir: "public",
				packageJson,
				packageManager: PnpmPackageManager,
			},
			{
				target: "cf",
				context: createMockContext(),
				dryRun: true,
			}
		);

		expect(readFileSync("pnpm-workspace.yaml", "utf8")).toBe(
			EXISTING_WORKSPACE_YAML
		);
	});

	it("leaves non-pnpm projects unchanged", async ({ expect }) => {
		vi.spyOn(cliPackages, "installPackages").mockResolvedValue();
		vi.spyOn(cliPackages, "installWrangler").mockResolvedValue();
		const packageJson = { name: "my-static-app" };
		await seed({
			"package.json": JSON.stringify(packageJson),
			"public/index.html": "<h1>Hello World</h1>",
		});

		await runAutoConfig(
			{
				configured: false,
				projectPath: process.cwd(),
				workerName: "my-static-app",
				framework: new Static({ id: "static", name: "Static" }),
				outputDir: "public",
				packageJson,
				packageManager: NpmPackageManager,
			},
			{
				target: "cf",
				context: createMockContext(),
				skipConfirmations: true,
				runBuild: false,
			}
		);

		expect(existsSync("pnpm-workspace.yaml")).toBe(false);
	});
});
