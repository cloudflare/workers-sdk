import { existsSync, writeFileSync } from "node:fs";
import { writePnpmWorkspaceYaml } from "helpers/packages";
import { beforeEach, describe, test, vi } from "vitest";
import { mockPackageManager } from "./mocks";

vi.mock("node:fs");
vi.mock("which-pm-runs");

describe("writePnpmWorkspaceYaml", () => {
	beforeEach(() => {
		mockPackageManager("npm");
		vi.mocked(existsSync).mockReturnValue(false);
		vi.mocked(writeFileSync).mockImplementation(() => undefined);
	});

	test("does nothing for non-pnpm package managers", ({ expect }) => {
		mockPackageManager("npm");
		writePnpmWorkspaceYaml("/some/project");
		expect(writeFileSync).not.toHaveBeenCalled();
	});

	test("does nothing for pnpm < 9", ({ expect }) => {
		mockPackageManager("pnpm", "8.15.0");
		writePnpmWorkspaceYaml("/some/project");
		expect(writeFileSync).not.toHaveBeenCalled();
	});

	test("does nothing if pnpm-workspace.yaml already exists", ({ expect }) => {
		mockPackageManager("pnpm", "10.0.0");
		vi.mocked(existsSync).mockReturnValue(true);
		writePnpmWorkspaceYaml("/some/project");
		expect(writeFileSync).not.toHaveBeenCalled();
	});

	test("writes onlyBuiltDependencies list for pnpm 9.x", ({ expect }) => {
		mockPackageManager("pnpm", "9.5.0");
		writePnpmWorkspaceYaml("/some/project");
		expect(writeFileSync).toHaveBeenCalledOnce();
		const written = vi.mocked(writeFileSync).mock.calls[0][1] as string;
		expect(written).toContain("onlyBuiltDependencies:");
		expect(written).toContain("- esbuild");
		expect(written).toContain("- workerd");
		expect(written).toContain("- sharp");
		// Must not use YAML booleans (wrong for this format)
		expect(written).not.toContain("allowBuilds:");
	});

	test("writes allowBuilds map with boolean values for pnpm 10+", ({ expect }) => {
		mockPackageManager("pnpm", "10.0.0");
		writePnpmWorkspaceYaml("/some/project");
		expect(writeFileSync).toHaveBeenCalledOnce();
		const written = vi.mocked(writeFileSync).mock.calls[0][1] as string;
		expect(written).toContain("allowBuilds:");
		expect(written).toContain("esbuild: true");
		expect(written).toContain("workerd: true");
		expect(written).toContain("sharp: true");
		// Must not use quoted strings — pnpm 10 requires real YAML booleans
		expect(written).not.toContain("esbuild: 'true'");
		expect(written).not.toContain('esbuild: "true"');
		expect(written).not.toContain("onlyBuiltDependencies:");
	});

	test("writes to the correct path", ({ expect }) => {
		mockPackageManager("pnpm", "10.1.0");
		writePnpmWorkspaceYaml("/my/project");
		expect(writeFileSync).toHaveBeenCalledWith(
			"/my/project/pnpm-workspace.yaml",
			expect.any(String)
		);
	});
});
