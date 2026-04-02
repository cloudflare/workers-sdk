import { seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { detectFramework } from "../../../../autoconfig/details/framework-detection";
import {
	BunPackageManager,
	NpmPackageManager,
	PnpmPackageManager,
	YarnPackageManager,
} from "../../../../package-manager";
import { runInTempDir } from "../../../helpers/run-in-tmp";

describe("detectFramework() / package manager detection", () => {
	runInTempDir();

	it("detects npm when package-lock.json is present", async ({ expect }) => {
		await seed({
			"package.json": JSON.stringify({ dependencies: { astro: "5" } }),
			"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
		});

		const result = await detectFramework(process.cwd());

		expect(result.packageManager).toStrictEqual(NpmPackageManager);
	});

	it("detects pnpm when pnpm-lock.yaml is present", async ({ expect }) => {
		await seed({
			"package.json": JSON.stringify({ dependencies: { astro: "5" } }),
			"pnpm-lock.yaml": "lockfileVersion: '6.0'\n",
		});

		const result = await detectFramework(process.cwd());

		expect(result.packageManager).toStrictEqual(PnpmPackageManager);
	});

	it("detects yarn when yarn.lock is present", async ({ expect }) => {
		await seed({
			"package.json": JSON.stringify({ dependencies: { astro: "5" } }),
			"yarn.lock": "# yarn lockfile v1\n",
		});

		const result = await detectFramework(process.cwd());

		expect(result.packageManager).toStrictEqual(YarnPackageManager);
	});

	it("detects bun when bun.lock is present", async ({ expect }) => {
		await seed({
			"package.json": JSON.stringify({ dependencies: { astro: "5" } }),
			"bun.lock": "",
		});

		const result = await detectFramework(process.cwd());

		expect(result.packageManager).toStrictEqual(BunPackageManager);
	});

	it("falls back to npm when no package manager lock file is present", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({ dependencies: { astro: "5" } }),
		});

		const result = await detectFramework(process.cwd());

		expect(result.packageManager).toStrictEqual(NpmPackageManager);
	});
});
