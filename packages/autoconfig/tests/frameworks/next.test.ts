import assert from "node:assert";
import { runCommand } from "@cloudflare/cli-shared-helpers/command";
import { installPackages } from "@cloudflare/cli-shared-helpers/packages";
import { NpmPackageManager } from "@cloudflare/workers-utils";
import { describe, it, vi } from "vitest";
import { AutoConfigFrameworkConfigurationError } from "../../src/errors";
import { getFrameworkPackageInfo } from "../../src/frameworks/all-frameworks";
import { NextJs } from "../../src/frameworks/next";
import { getInstalledPackageVersion } from "../../src/frameworks/utils/packages";
import { createMockContext } from "../helpers/mock-context";

vi.mock("@cloudflare/cli-shared-helpers/command");
vi.mock("@cloudflare/cli-shared-helpers/packages");
vi.mock("../../src/frameworks/utils/packages");

describe("NextJs", () => {
	const context = createMockContext();

	it("selects upgrades for unsupported Next.js versions", ({ expect }) => {
		const cases = [
			["15.1.0", "15.5.21"],
			["15.5.7", "15.5.21"],
			["15.5.20", "15.5.21"],
			["15.5.21", undefined],
			["16.0.7", "16.2.11"],
			["16.2.6", "16.2.11"],
			["16.2.10", "16.2.11"],
			["16.2.11-canary.3", "16.2.11"],
			["16.2.11", undefined],
			["16.3.0", undefined],
		] as const;
		const packageInfo = getFrameworkPackageInfo("next");
		assert(packageInfo);

		for (const [installedVersion, upgradeTo] of cases) {
			vi.mocked(getInstalledPackageVersion).mockReturnValue(installedVersion);
			const framework = new NextJs({ id: "next", name: "Next.js" });

			expect(
				framework.validateFrameworkVersion("/project", packageInfo, context)
					?.upgradeTo
			).toBe(upgradeTo);
		}
	});

	it("rejects versions below the minimum that cannot be upgraded", ({
		expect,
	}) => {
		const packageInfo = getFrameworkPackageInfo("next");
		assert(packageInfo);

		// 15.0.x is excluded from the upgrade ranges: `create-next-app` pinned React to a 19
		// prerelease before Next.js 15.1, so the upgrade could not resolve
		for (const installedVersion of ["13.5.11", "14.2.35", "15.0.0", "15.0.4"]) {
			vi.mocked(getInstalledPackageVersion).mockReturnValue(installedVersion);
			const framework = new NextJs({ id: "next", name: "Next.js" });

			expect(() =>
				framework.validateFrameworkVersion("/project", packageInfo, context)
			).toThrow(AutoConfigFrameworkConfigurationError);
		}
	});

	it("installs only the targeted Next.js version", async ({ expect }) => {
		const cases = [
			["15.5.20", "15.5.21"],
			["16.2.10", "16.2.11"],
		] as const;

		for (const [installedVersion, upgradeTo] of cases) {
			vi.mocked(installPackages).mockResolvedValue();
			const framework = new NextJs({ id: "next", name: "Next.js" });

			await framework.upgradeFrameworkVersion({
				installedVersion,
				upgradeTo,
				packageManager: NpmPackageManager,
				isWorkspaceRoot: true,
			});

			expect(installPackages).toHaveBeenCalledWith(
				"npm",
				[`next@${upgradeTo}`],
				expect.objectContaining({ isWorkspaceRoot: true })
			);
		}
	});

	it("propagates package manager failures unchanged", async ({ expect }) => {
		const installError = new Error(
			"npm error ERESOLVE unable to resolve dependency tree"
		);
		vi.mocked(installPackages).mockRejectedValue(installError);
		const framework = new NextJs({ id: "next", name: "Next.js" });

		await expect(
			framework.upgradeFrameworkVersion({
				installedVersion: "15.5.20",
				upgradeTo: "15.5.21",
				packageManager: NpmPackageManager,
				isWorkspaceRoot: false,
			})
		).rejects.toBe(installError);
	});

	it("runs OpenNext migration without forcing dependency installation", async ({
		expect,
	}) => {
		vi.mocked(runCommand).mockResolvedValue("");
		const framework = new NextJs({ id: "next", name: "Next.js" });

		await framework.configure({
			projectPath: "/project",
			outputDir: ".open-next",
			workerName: "next-app",
			dryRun: false,
			packageManager: NpmPackageManager,
			isWorkspaceRoot: false,
			context,
		});

		expect(runCommand).toHaveBeenCalledWith(
			["npx", "@opennextjs/cloudflare", "migrate"],
			{ cwd: "/project" }
		);
	});
});
