import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { AutoConfigFrameworkConfigurationError } from "../../../autoconfig/errors";
import { getPackageJsonDependencyVersion } from "../../../autoconfig/frameworks/utils/packages";
import { installCloudflareVitePlugin } from "../../../autoconfig/frameworks/utils/vite-plugin";
import { Vite } from "../../../autoconfig/frameworks/vite";
import { NpmPackageManager } from "../../../package-manager";

vi.mock("../../../autoconfig/frameworks/utils/vite-plugin", () => ({
	installCloudflareVitePlugin: vi.fn(async () => {}),
}));

vi.mock("../../../autoconfig/frameworks/utils/packages", () => ({
	getInstalledPackageVersion: vi.fn(() => undefined),
	getPackageJsonDependencyVersion: vi.fn(() => undefined),
}));

const VITE_PACKAGE_INFO = {
	name: "vite",
	minimumVersion: "6.0.0",
	maximumKnownMajorVersion: "8",
};

function getBaseOptions() {
	return {
		projectPath: process.cwd(),
		workerName: "my-vite-app",
		outputDir: "dist",
		dryRun: false,
		packageManager: NpmPackageManager,
		isWorkspaceRoot: false,
	};
}

describe("Vite framework", () => {
	runInTempDir();

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getPackageJsonDependencyVersion).mockReturnValue(undefined);
	});

	it("validates the Vite version from package.json when dependencies are not installed", ({
		expect,
	}) => {
		vi.mocked(getPackageJsonDependencyVersion).mockReturnValue("8.0.12");

		const framework = new Vite({ id: "vite", name: "Vite" });
		expect(() =>
			framework.validateFrameworkVersion(process.cwd(), VITE_PACKAGE_INFO)
		).not.toThrow();
		expect(framework.frameworkVersion).toBe("8.0.12");
	});

	it("rejects unsupported Vite versions declared in package.json", ({
		expect,
	}) => {
		vi.mocked(getPackageJsonDependencyVersion).mockReturnValue("5.4.0");

		const framework = new Vite({ id: "vite", name: "Vite" });
		expect(() =>
			framework.validateFrameworkVersion(process.cwd(), VITE_PACKAGE_INFO)
		).toThrow(AutoConfigFrameworkConfigurationError);
	});

	it("creates a Vite config when the project does not have one", async ({
		expect,
	}) => {
		await writeFile("tsconfig.json", JSON.stringify({}));

		const framework = new Vite({ id: "vite", name: "Vite" });
		await framework.configure(getBaseOptions());

		const result = await readFile("vite.config.ts", "utf8");
		expect(result).toContain(
			'import { cloudflare } from "@cloudflare/vite-plugin";'
		);
		expect(result).toContain("plugins: [cloudflare()]");
		expect(installCloudflareVitePlugin).toHaveBeenCalledWith({
			packageManager: "npm",
			isWorkspaceRoot: false,
			projectPath: process.cwd(),
		});
	});

	it("does not create a duplicate Vite config when an unsupported config exists", async ({
		expect,
	}) => {
		await writeFile(
			"vite.config.cjs",
			`
const { defineConfig } = require("vite");

module.exports = defineConfig({
  plugins: [],
});
`
		);

		const framework = new Vite({ id: "vite", name: "Vite" });
		await expect(framework.configure(getBaseOptions())).rejects.toThrow(
			/Cannot modify Vite config: CommonJS Vite config files are not supported/
		);
		expect(installCloudflareVitePlugin).not.toHaveBeenCalled();
		expect(existsSync("vite.config.ts")).toBe(false);
		expect(existsSync("vite.config.js")).toBe(false);
	});
});
