import { join } from "node:path";
import {
	BunPackageManager,
	NpmPackageManager,
	NubPackageManager,
	PnpmPackageManager,
	YarnPackageManager,
} from "@cloudflare/workers-utils";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { detectFramework } from "../../../src/details/framework-detection";
import { createMockContext } from "../../helpers/mock-context";

describe("detectFramework() / package manager detection", () => {
	runInTempDir();
	const context = createMockContext();

	it("detects npm when package-lock.json is present", async ({ expect }) => {
		await seed({
			"package.json": JSON.stringify({ dependencies: { astro: "5" } }),
			"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
		});

		const result = await detectFramework(process.cwd(), context);

		expect(result.packageManager).toStrictEqual(NpmPackageManager);
	});

	it("detects pnpm when pnpm-lock.yaml is present", async ({ expect }) => {
		await seed({
			"package.json": JSON.stringify({ dependencies: { astro: "5" } }),
			"pnpm-lock.yaml": "lockfileVersion: '6.0'\n",
		});

		const result = await detectFramework(process.cwd(), context);

		expect(result.packageManager).toStrictEqual(PnpmPackageManager);
	});

	it("detects yarn when yarn.lock is present", async ({ expect }) => {
		await seed({
			"package.json": JSON.stringify({ dependencies: { astro: "5" } }),
			"yarn.lock": "# yarn lockfile v1\n",
		});

		const result = await detectFramework(process.cwd(), context);

		expect(result.packageManager).toStrictEqual(YarnPackageManager);
	});

	it("detects bun when bun.lock is present", async ({ expect }) => {
		await seed({
			"package.json": JSON.stringify({ dependencies: { astro: "5" } }),
			"bun.lock": "",
		});

		const result = await detectFramework(process.cwd(), context);

		expect(result.packageManager).toStrictEqual(BunPackageManager);
	});

	it("detects nub when nub.lock is present", async ({ expect }) => {
		await seed({
			"package.json": JSON.stringify({ dependencies: { astro: "5" } }),
			"nub.lock": "",
		});

		const result = await detectFramework(process.cwd(), context);

		expect(result.packageManager).toStrictEqual(NubPackageManager);
	});

	it("falls back to npm when no package manager lock file is present", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({ dependencies: { astro: "5" } }),
		});

		const result = await detectFramework(process.cwd(), context);

		expect(result.packageManager).toStrictEqual(NpmPackageManager);
	});

	it("detects pnpm from the workspace root's lockfile when the app has none", async ({
		expect,
	}) => {
		await seed({
			"pnpm-workspace.yaml": "packages:\n  - 'apps/*'\n",
			"package.json": JSON.stringify({
				name: "my-workspace",
				private: true,
				workspaces: ["apps/*"],
			}),
			"pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
			"apps/worker/package.json": JSON.stringify({
				name: "worker",
				private: true,
				dependencies: { astro: "5" },
			}),
		});

		const result = await detectFramework(
			join(process.cwd(), "apps/worker"),
			context
		);

		expect(result.packageManager).toStrictEqual(PnpmPackageManager);
	});

	it("detects pnpm from the workspace root's packageManager field when the app declares none", async ({
		expect,
	}) => {
		await seed({
			"pnpm-workspace.yaml": "packages:\n  - 'apps/*'\n",
			"package.json": JSON.stringify({
				name: "my-workspace",
				private: true,
				workspaces: ["apps/*"],
				packageManager: "pnpm@12.16.1",
			}),
			"apps/worker/package.json": JSON.stringify({
				name: "worker",
				private: true,
				dependencies: { astro: "5" },
			}),
		});

		const result = await detectFramework(
			join(process.cwd(), "apps/worker"),
			context
		);

		expect(result.packageManager).toStrictEqual(PnpmPackageManager);
	});

	it("prefers the app's own packageManager declaration over the workspace root's", async ({
		expect,
	}) => {
		await seed({
			"pnpm-workspace.yaml": "packages:\n  - 'apps/*'\n",
			"package.json": JSON.stringify({
				name: "my-workspace",
				private: true,
				workspaces: ["apps/*"],
				packageManager: "pnpm@12.16.1",
			}),
			"pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
			"apps/worker/package.json": JSON.stringify({
				name: "worker",
				private: true,
				dependencies: { astro: "5" },
				packageManager: "yarn@1.22.22",
			}),
		});

		const result = await detectFramework(
			join(process.cwd(), "apps/worker"),
			context
		);

		expect(result.packageManager).toStrictEqual(YarnPackageManager);
	});
});
