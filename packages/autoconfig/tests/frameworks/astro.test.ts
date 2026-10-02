import { existsSync } from "node:fs";
import { join } from "node:path";
import * as cliCommand from "@cloudflare/cli-shared-helpers/command";
import * as cliPackages from "@cloudflare/cli-shared-helpers/packages";
import { NpmPackageManager } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { AutoConfigFrameworkConfigurationError } from "../../src/errors";
import { Astro } from "../../src/frameworks/astro";
import * as packagesUtils from "../../src/frameworks/utils/packages";
import { createMockContext } from "../helpers/mock-context";

vi.mock("../../src/frameworks/utils/packages", () => ({
	getInstalledPackageVersion: vi.fn(),
	isPackageInstalled: vi.fn(),
}));

const context = createMockContext();

function createFramework(version: string, adapterVersion?: string): Astro {
	vi.mocked(packagesUtils.getInstalledPackageVersion).mockImplementation(
		(packageName) =>
			packageName === "@astrojs/cloudflare" ? adapterVersion : undefined
	);

	const framework = new Astro({ id: "astro", name: "Astro" });
	vi.spyOn(framework, "frameworkVersion", "get").mockReturnValue(version);
	return framework;
}

function getOptions(projectPath: string) {
	return {
		target: "cf" as const,
		projectPath,
		workerName: "my-astro-app",
		outputDir: "dist",
		dryRun: false,
		packageManager: NpmPackageManager,
		isWorkspaceRoot: false,
		context,
	};
}

describe("Astro framework", () => {
	runInTempDir();

	beforeEach(() => {
		vi.spyOn(cliCommand, "runCommand").mockImplementation(async () => {});
		vi.spyOn(cliPackages, "installPackages").mockImplementation(async () => {});
	});

	describe.each([
		[undefined, false],
		["14.3.3", false],
		["15.0.0-beta.0", true],
		["15.0.0", true],
	] as const)("adapter %s", (adapterVersion, expected) => {
		it(`is configured: ${expected}`, ({ expect }) => {
			expect(
				createFramework("7.3.5", adapterVersion).isConfigured(process.cwd())
			).toBe(expected);
		});
	});

	it("configures Astro 7 for cf", async ({ expect }) => {
		const projectPath = process.cwd();

		const result = await createFramework("7.3.5").configure(
			getOptions(projectPath)
		);

		expect(cliPackages.installPackages).toHaveBeenCalledWith(
			"npm",
			["astro@beta"],
			expect.objectContaining({ cwd: projectPath })
		);
		expect(cliCommand.runCommand).toHaveBeenCalledWith(
			["npx", "astro", "add", "@astrojs/cloudflare@beta", "-y"],
			expect.objectContaining({ cwd: projectPath })
		);
		expect(existsSync(join(projectPath, "public", ".assetsignore"))).toBe(
			false
		);
		expect(result).toEqual({ workerConfig: null });
	});

	it("requires Astro 7 before configuring for cf", async ({ expect }) => {
		const projectPath = process.cwd();
		const configuration = createFramework("6.0.0").configure(
			getOptions(projectPath)
		);

		await expect(configuration).rejects.toThrow(
			AutoConfigFrameworkConfigurationError
		);
		await expect(configuration).rejects.toThrow(
			'cf only supports Astro 7 or later, but this project uses Astro "6.0.0". Please update Astro and try again, or continue using Wrangler if you are not ready to upgrade.'
		);
		expect(cliPackages.installPackages).not.toHaveBeenCalled();
	});
});
