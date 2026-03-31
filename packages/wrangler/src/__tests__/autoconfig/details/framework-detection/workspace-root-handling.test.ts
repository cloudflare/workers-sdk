import { seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { detectFramework } from "../../../../autoconfig/details/framework-detection";
import { runInTempDir } from "../../../helpers/run-in-tmp";

describe("detectFramework() / workspace root handling", () => {
	runInTempDir();

	it("sets isWorkspaceRoot to false for regular (non-monorepo) projects", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({ name: "my-app" }),
			"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
		});

		const result = await detectFramework(process.cwd());

		expect(result.isWorkspaceRoot).toBe(false);
	});

	it("sets isWorkspaceRoot to true when the workspace root is itself a workspace package", async ({
		expect,
	}) => {
		await seed({
			"pnpm-workspace.yaml": "packages:\n  - 'packages/*'\n  - '.'\n",
			"package.json": JSON.stringify({
				name: "my-workspace",
				workspaces: ["packages/*", "."],
			}),
			"packages/my-app/package.json": JSON.stringify({ name: "my-app" }),
		});

		const result = await detectFramework(process.cwd());

		expect(result.isWorkspaceRoot).toBe(true);
	});

	it("throws UserError when run from a workspace root that does not include the root as a package", async ({
		expect,
	}) => {
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
			detectFramework(process.cwd())
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: The Wrangler application detection logic has been run in the root of a workspace instead of targeting a specific project. Change your working directory to one of the applications in the workspace and try again.]`
		);
	});
});
