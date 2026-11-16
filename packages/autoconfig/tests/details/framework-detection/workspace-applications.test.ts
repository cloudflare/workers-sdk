import { join } from "node:path";
import {
	mockConsoleMethods,
	runInTempDir,
	seed,
} from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { getDetailsForAutoConfig } from "../../../src/details";
import { detectFramework } from "../../../src/details/framework-detection";
import { createMockContext } from "../../helpers/mock-context";

describe("workspace applications", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	const context = createMockContext();

	const lockFiles = {
		npm: "package-lock.json",
		pnpm: "pnpm-lock.yaml",
		yarn: "yarn.lock",
		bun: "bun.lock",
	};

	async function seedWorkspace(
		manager: keyof typeof lockFiles = "pnpm",
		packages = ["packages/*"]
	) {
		await seed({
			"package.json": JSON.stringify({
				name: "workspace-root",
				packageManager: `${manager}@${manager === "pnpm" ? "10.0.0" : "1.0.0"}`,
				workspaces: packages,
				dependencies: { next: "15" },
			}),
			...(manager === "pnpm"
				? { "pnpm-workspace.yaml": `packages: ${JSON.stringify(packages)}\n` }
				: {}),
			[lockFiles[manager]]: "",
			"packages/app/package.json": JSON.stringify({
				name: "astro-app",
				dependencies: { astro: "5" },
				scripts: { build: "cf build", dev: "cf dev" },
			}),
			"packages/app/cloudflare.config.ts": "export default {};",
			"packages/other/package.json": JSON.stringify({
				name: "other-app",
				dependencies: { next: "15" },
			}),
		});
	}

	it.for(["npm", "pnpm", "yarn", "bun"] as const)(
		"when the target is cf uses the %s workspace lockfile without changing application paths or commands",
		async (manager, { expect }) => {
			await seedWorkspace(manager);
			const projectPath = join(process.cwd(), "packages/app");

			const details = await getDetailsForAutoConfig({
				projectPath,
				context,
				target: "cf",
			});

			expect(details).toMatchObject({
				configured: true,
				projectPath,
				packageJson: { name: "astro-app" },
				packageManager: { type: manager },
				framework: { id: "astro" },
				buildCommand: "astro build",
				devCommand: "astro dev",
				isWorkspaceRoot: false,
			});
			const { detectedFramework } = await detectFramework(projectPath, context);
			expect(detectedFramework.dist).toBe("dist");
			expect(std.warn).not.toContain("No lock file");
		}
	);

	it("keeps Wrangler's application-only detection", async ({ expect }) => {
		await seedWorkspace();
		const result = await detectFramework(
			join(process.cwd(), "packages/app"),
			context,
			{
				target: "wrangler",
			}
		);

		expect(result.packageManager.type).toBe("npm");
		expect(result.detectedFramework).toMatchObject({
			framework: { id: "astro" },
			buildCommand: "npm run build",
			dist: "dist",
		});
		expect(std.warn).toContain("No lock file");
	});

	it("does not use a workspace that excludes the application", async ({
		expect,
	}) => {
		await seedWorkspace("pnpm", ["packages/other"]);
		const result = await detectFramework(
			join(process.cwd(), "packages/app"),
			context
		);

		expect(result.packageManager.type).toBe("npm");
		expect(std.warn).toContain("No lock file");
	});

	it.for([".git", ".git/HEAD"])(
		"includes a workspace at the repository boundary (%s)",
		async (gitPath, { expect }) => {
			await seedWorkspace();
			await seed({ [gitPath]: "gitdir: elsewhere" });
			const result = await detectFramework(
				join(process.cwd(), "packages/app"),
				context
			);

			expect(result.packageManager.type).toBe("pnpm");
			expect(std.warn).not.toContain("No lock file");
		}
	);

	it.for([
		"packages/app/.git",
		"packages/app/.git/HEAD",
		"packages/.git",
		"packages/.git/HEAD",
	])(
		"does not search beyond the application's repository boundary (%s)",
		async (gitPath, { expect }) => {
			await seedWorkspace();
			await seed({ [gitPath]: "gitdir: elsewhere" });
			const result = await detectFramework(
				join(process.cwd(), "packages/app"),
				context
			);

			expect(result.packageManager.type).toBe("npm");
			expect(std.warn).toContain("No lock file");
		}
	);

	it("still warns when the workspace has no lockfile", async ({ expect }) => {
		await seed({
			"package.json": JSON.stringify({
				packageManager: "pnpm@10.0.0",
			}),
			"pnpm-workspace.yaml": "packages: ['packages/*']\n",
			"packages/app/package.json": JSON.stringify({
				dependencies: { astro: "5" },
			}),
		});
		const result = await detectFramework(
			join(process.cwd(), "packages/app"),
			context
		);

		expect(result.packageManager.type).toBe("pnpm");
		expect(std.warn).toContain("No lock file");
	});
});
