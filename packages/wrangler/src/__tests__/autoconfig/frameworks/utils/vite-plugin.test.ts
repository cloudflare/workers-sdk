import * as cliPackages from "@cloudflare/cli-shared-helpers/packages";
import { beforeEach, describe, it, vi } from "vitest";
import { getInstalledPackageVersion } from "../../../../autoconfig/frameworks/utils/packages";
import { installCloudflareVitePlugin } from "../../../../autoconfig/frameworks/utils/vite-plugin";
import type { MockInstance } from "vitest";

vi.mock("../../../../autoconfig/frameworks/utils/packages", () => ({
	getInstalledPackageVersion: vi.fn(),
}));

describe("installCloudflareVitePlugin", () => {
	let installSpy: MockInstance;

	beforeEach(() => {
		installSpy = vi
			.spyOn(cliPackages, "installPackages")
			.mockImplementation(async () => {});
	});

	describe("when Vite is not installed/detected", () => {
		beforeEach(() => {
			vi.mocked(getInstalledPackageVersion).mockReturnValue(undefined);
		});

		it("installs only @cloudflare/vite-plugin", async ({ expect }) => {
			await installCloudflareVitePlugin({
				packageManager: "npm",
				projectPath: "/test/project",
				isWorkspaceRoot: false,
			});

			expect(installSpy).toHaveBeenCalledTimes(1);
			expect(installSpy).toHaveBeenCalledWith(
				"npm",
				["@cloudflare/vite-plugin"],
				expect.objectContaining({ dev: true })
			);
		});

		it("does not attempt to upgrade Vite", async ({ expect }) => {
			await installCloudflareVitePlugin({
				packageManager: "npm",
				projectPath: "/test/project",
				isWorkspaceRoot: false,
			});

			expect(installSpy).not.toHaveBeenCalledWith(
				expect.anything(),
				["vite@^6.1.0"],
				expect.anything()
			);
		});
	});

	describe("when Vite version is in [6.0.0, 6.1.0) range", () => {
		it("upgrades Vite before installing the plugin for version 6.0.0", async ({
			expect,
		}) => {
			vi.mocked(getInstalledPackageVersion).mockReturnValue("6.0.0");

			await installCloudflareVitePlugin({
				packageManager: "npm",
				projectPath: "/test/project",
				isWorkspaceRoot: false,
			});

			expect(installSpy).toHaveBeenCalledTimes(2);
			expect(installSpy).toHaveBeenNthCalledWith(
				1,
				"npm",
				["vite@^6.1.0"],
				expect.objectContaining({ dev: true })
			);
			expect(installSpy).toHaveBeenNthCalledWith(
				2,
				"npm",
				["@cloudflare/vite-plugin"],
				expect.objectContaining({ dev: true })
			);
		});

		it("upgrades Vite before installing the plugin for version 6.0.5", async ({
			expect,
		}) => {
			vi.mocked(getInstalledPackageVersion).mockReturnValue("6.0.5");

			await installCloudflareVitePlugin({
				packageManager: "npm",
				projectPath: "/test/project",
				isWorkspaceRoot: false,
			});

			expect(installSpy).toHaveBeenCalledTimes(2);
			expect(installSpy).toHaveBeenNthCalledWith(
				1,
				"npm",
				["vite@^6.1.0"],
				expect.objectContaining({ dev: true })
			);
			expect(installSpy).toHaveBeenNthCalledWith(
				2,
				"npm",
				["@cloudflare/vite-plugin"],
				expect.objectContaining({ dev: true })
			);
		});
	});

	describe("when Vite version is >= 6.1.0", () => {
		it("does not upgrade Vite for version 6.1.0", async ({ expect }) => {
			vi.mocked(getInstalledPackageVersion).mockReturnValue("6.1.0");

			await installCloudflareVitePlugin({
				packageManager: "npm",
				projectPath: "/test/project",
				isWorkspaceRoot: false,
			});

			expect(installSpy).toHaveBeenCalledTimes(1);
			expect(installSpy).toHaveBeenCalledWith(
				"npm",
				["@cloudflare/vite-plugin"],
				expect.objectContaining({ dev: true })
			);
		});

		it("does not upgrade Vite for version 6.2.0", async ({ expect }) => {
			vi.mocked(getInstalledPackageVersion).mockReturnValue("6.2.0");

			await installCloudflareVitePlugin({
				packageManager: "npm",
				projectPath: "/test/project",
				isWorkspaceRoot: false,
			});

			expect(installSpy).toHaveBeenCalledTimes(1);
			expect(installSpy).not.toHaveBeenCalledWith(
				expect.anything(),
				["vite@^6.1.0"],
				expect.anything()
			);
		});

		it("does not upgrade Vite for version 7.0.0", async ({ expect }) => {
			vi.mocked(getInstalledPackageVersion).mockReturnValue("7.0.0");

			await installCloudflareVitePlugin({
				packageManager: "npm",
				projectPath: "/test/project",
				isWorkspaceRoot: false,
			});

			expect(installSpy).toHaveBeenCalledTimes(1);
			expect(installSpy).not.toHaveBeenCalledWith(
				expect.anything(),
				["vite@^6.1.0"],
				expect.anything()
			);
		});
	});

	describe("when Vite version is < 6.0.0", () => {
		it("does not upgrade Vite for version 5.4.0", async ({ expect }) => {
			vi.mocked(getInstalledPackageVersion).mockReturnValue("5.4.0");

			await installCloudflareVitePlugin({
				packageManager: "npm",
				projectPath: "/test/project",
				isWorkspaceRoot: false,
			});

			expect(installSpy).toHaveBeenCalledTimes(1);
			expect(installSpy).not.toHaveBeenCalledWith(
				expect.anything(),
				["vite@^6.1.0"],
				expect.anything()
			);
		});

		it("does not upgrade Vite for version 4.0.0", async ({ expect }) => {
			vi.mocked(getInstalledPackageVersion).mockReturnValue("4.0.0");

			await installCloudflareVitePlugin({
				packageManager: "npm",
				projectPath: "/test/project",
				isWorkspaceRoot: false,
			});

			expect(installSpy).toHaveBeenCalledTimes(1);
			expect(installSpy).toHaveBeenCalledWith(
				"npm",
				["@cloudflare/vite-plugin"],
				expect.objectContaining({ dev: true })
			);
		});
	});

	describe("parameter forwarding", () => {
		beforeEach(() => {
			vi.mocked(getInstalledPackageVersion).mockReturnValue(undefined);
		});

		it("forwards isWorkspaceRoot to installPackages", async ({ expect }) => {
			await installCloudflareVitePlugin({
				packageManager: "npm",
				projectPath: "/test/project",
				isWorkspaceRoot: true,
			});

			expect(installSpy).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				expect.objectContaining({ isWorkspaceRoot: true })
			);
		});

		it("forwards isWorkspaceRoot when upgrading Vite", async ({ expect }) => {
			vi.mocked(getInstalledPackageVersion).mockReturnValue("6.0.0");

			await installCloudflareVitePlugin({
				packageManager: "npm",
				projectPath: "/test/project",
				isWorkspaceRoot: true,
			});

			// Both the Vite upgrade and plugin install should have isWorkspaceRoot: true
			expect(installSpy).toHaveBeenNthCalledWith(
				1,
				expect.anything(),
				["vite@^6.1.0"],
				expect.objectContaining({ isWorkspaceRoot: true })
			);
			expect(installSpy).toHaveBeenNthCalledWith(
				2,
				expect.anything(),
				["@cloudflare/vite-plugin"],
				expect.objectContaining({ isWorkspaceRoot: true })
			);
		});

		it("forwards packageManager to installPackages", async ({ expect }) => {
			await installCloudflareVitePlugin({
				packageManager: "pnpm",
				projectPath: "/test/project",
				isWorkspaceRoot: false,
			});

			expect(installSpy).toHaveBeenCalledWith(
				"pnpm",
				expect.anything(),
				expect.anything()
			);
		});

		it("forwards different package managers correctly", async ({ expect }) => {
			for (const pm of ["npm", "yarn", "pnpm", "bun"] as const) {
				installSpy.mockClear();

				await installCloudflareVitePlugin({
					packageManager: pm,
					projectPath: "/test/project",
					isWorkspaceRoot: false,
				});

				expect(installSpy).toHaveBeenCalledWith(
					pm,
					expect.anything(),
					expect.anything()
				);
			}
		});

		it("passes projectPath to getInstalledPackageVersion", async ({
			expect,
		}) => {
			await installCloudflareVitePlugin({
				packageManager: "npm",
				projectPath: "/custom/path",
				isWorkspaceRoot: false,
			});

			expect(getInstalledPackageVersion).toHaveBeenCalledWith(
				"vite",
				"/custom/path"
			);
		});
	});
});
