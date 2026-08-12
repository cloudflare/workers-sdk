import { NpmPackageManager } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { NextJs } from "../src/frameworks/next";
import { getInstalledPackageVersion } from "../src/frameworks/utils/packages";
import { runAutoConfig } from "../src/run";
import { createMockContext } from "./helpers/mock-context";
import type { AutoConfigContext } from "../src/context";

vi.mock("../src/frameworks/utils/packages");

describe("autoconfig framework upgrades", () => {
	runInTempDir();

	let context: AutoConfigContext;
	let framework: NextJs;

	beforeEach(() => {
		context = createMockContext();
		framework = new NextJs({ id: "next", name: "Next.js" });
	});

	function run(
		options: { dryRun?: boolean; skipConfirmations?: boolean } = {}
	) {
		return runAutoConfig(
			{
				projectPath: process.cwd(),
				workerName: "my-worker",
				configured: false,
				outputDir: ".open-next",
				framework,
				packageManager: NpmPackageManager,
			},
			{
				context,
				runBuild: false,
				enableWranglerInstallation: false,
				...options,
			}
		);
	}

	it("upgrades after confirmation and revalidates before configuring", async ({
		expect,
	}) => {
		vi.mocked(context.dialogs.confirm)
			.mockResolvedValueOnce(false)
			.mockResolvedValueOnce(true);
		let installedVersion = "15.5.20";
		vi.mocked(getInstalledPackageVersion).mockImplementation(
			() => installedVersion
		);
		const callOrder: string[] = [];
		vi.spyOn(framework, "upgradeFrameworkVersion").mockImplementation(
			async () => {
				callOrder.push("upgrade");
				installedVersion = "15.5.21";
			}
		);
		vi.spyOn(framework, "configure").mockImplementation(({ dryRun }) => {
			callOrder.push(dryRun ? "configure:dry-run" : "configure");
			return Promise.resolve({ wranglerConfig: null });
		});

		const summary = await run();

		expect(callOrder).toEqual(["configure:dry-run", "upgrade", "configure"]);
		expect(summary.frameworkVersionUpgrade).toContain(
			'Next.js from "15.5.20" to "15.5.21"'
		);
	});

	it("does not upgrade when setup is declined", async ({ expect }) => {
		vi.mocked(context.dialogs.confirm)
			.mockResolvedValueOnce(false)
			.mockResolvedValueOnce(false);
		vi.mocked(getInstalledPackageVersion).mockReturnValue("15.5.20");
		const upgradeSpy = vi
			.spyOn(framework, "upgradeFrameworkVersion")
			.mockImplementation(async () => {});
		vi.spyOn(framework, "configure").mockResolvedValue({
			wranglerConfig: null,
		});

		await expect(run()).rejects.toThrow("Setup cancelled");
		expect(upgradeSpy).not.toHaveBeenCalled();
	});

	it("reports but does not apply an upgrade during a dry run", async ({
		expect,
	}) => {
		vi.mocked(getInstalledPackageVersion).mockReturnValue("16.2.10");
		const upgradeSpy = vi
			.spyOn(framework, "upgradeFrameworkVersion")
			.mockImplementation(async () => {});
		vi.spyOn(framework, "configure").mockResolvedValue({
			wranglerConfig: null,
		});

		const summary = await run({ dryRun: true });

		expect(summary.frameworkVersionUpgrade).toContain(
			'Next.js from "16.2.10" to "16.2.11"'
		);
		expect(upgradeSpy).not.toHaveBeenCalled();
	});

	it("applies an upgrade when confirmations are explicitly skipped", async ({
		expect,
	}) => {
		let installedVersion = "15.5.20";
		vi.mocked(getInstalledPackageVersion).mockImplementation(
			() => installedVersion
		);
		const upgradeSpy = vi
			.spyOn(framework, "upgradeFrameworkVersion")
			.mockImplementation(async () => {
				installedVersion = "15.5.21";
			});
		vi.spyOn(framework, "configure").mockResolvedValue({
			wranglerConfig: null,
		});

		await run({ skipConfirmations: true });

		expect(context.dialogs.confirm).not.toHaveBeenCalled();
		expect(upgradeSpy).toHaveBeenCalledOnce();
	});

	it("fails when the version is still unsupported after upgrading", async ({
		expect,
	}) => {
		// The upgrade reports success without changing the installed version
		vi.mocked(getInstalledPackageVersion).mockReturnValue("15.5.20");
		vi.spyOn(framework, "upgradeFrameworkVersion").mockImplementation(
			async () => {}
		);
		const configureSpy = vi
			.spyOn(framework, "configure")
			.mockResolvedValue({ wranglerConfig: null });

		await expect(run({ skipConfirmations: true })).rejects.toThrow(
			'but the version installed in the project is still "15.5.20"'
		);
		// The dry run builds the summary, but the project is never configured for real
		expect(configureSpy).toHaveBeenCalledTimes(1);
	});
});
