import { PnpmPackageManager } from "@cloudflare/workers-utils";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { join } from "node:path";
import { describe, it } from "vitest";
import { detectFramework } from "../../../src/details/framework-detection";
import { createMockContext } from "../../helpers/mock-context";

describe("detectFramework() / package manager detection inside workspaces", () => {
	runInTempDir();
	const context = createMockContext();

	it("detects pnpm from the workspace root's lock file when the workspace package has none", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({
				name: "my-workspace",
				workspaces: ["packages/*"],
			}),
			"pnpm-workspace.yaml": "packages:\n  - 'packages/*'\n",
			"pnpm-lock.yaml": "lockfileVersion: '6.0'\n",
			"packages/my-app/package.json": JSON.stringify({
				name: "my-app",
				dependencies: { astro: "5" },
			}),
		});

		const result = await detectFramework(
			join(process.cwd(), "packages/my-app"),
			context
		);

		expect(result.packageManager).toStrictEqual(PnpmPackageManager);
	});

	it("detects pnpm from the workspace root's packageManager field", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({
				name: "my-workspace",
				private: true,
				workspaces: ["apps/*"],
				packageManager: "pnpm@12.16.1",
			}),
			"apps/my-app/package.json": JSON.stringify({
				name: "my-app",
				dependencies: { astro: "5" },
			}),
		});

		const result = await detectFramework(
			join(process.cwd(), "apps/my-app"),
			context
		);

		expect(result.packageManager).toStrictEqual(PnpmPackageManager);
	});
});
