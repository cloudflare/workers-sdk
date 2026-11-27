import { describe, it, vi } from "vitest";
import { getInstalledPackageVersion } from "../../../src/frameworks/utils/packages";
import { getCloudflareVitePluginDependencies } from "../../../src/frameworks/utils/vite-plugin";

vi.mock("../../../src/frameworks/utils/packages", () => ({
	getInstalledPackageVersion: vi.fn(),
}));

const PLUGIN = { name: "@cloudflare/vite-plugin", dev: true };

describe("getCloudflareVitePluginDependencies", () => {
	it("needs the v2 release candidate for cf", ({ expect }) => {
		vi.mocked(getInstalledPackageVersion).mockReturnValue("6.0.0");

		expect(
			getCloudflareVitePluginDependencies({
				projectPath: "/test/project",
				target: "cf",
			})
		).toEqual([{ ...PLUGIN, version: "^2.0.0-rc.0" }]);
	});

	it.for([undefined, "4.0.0", "5.4.0", "6.1.0", "6.2.0", "7.0.0"])(
		"needs only the latest plugin for Wrangler with Vite %s",
		(viteVersion, { expect }) => {
			vi.mocked(getInstalledPackageVersion).mockReturnValue(viteVersion);

			expect(
				getCloudflareVitePluginDependencies({
					projectPath: "/test/project",
					target: "wrangler",
				})
			).toEqual([PLUGIN]);
		}
	);

	it.for(["6.0.0", "6.0.5"])(
		"upgrades Vite %s before the plugin for Wrangler",
		(viteVersion, { expect }) => {
			vi.mocked(getInstalledPackageVersion).mockReturnValue(viteVersion);

			expect(
				getCloudflareVitePluginDependencies({
					projectPath: "/test/project",
					target: "wrangler",
				})
			).toEqual([{ name: "vite", version: "^6.1.0", dev: true }, PLUGIN]);
		}
	);

	it("checks the project's own Vite version", ({ expect }) => {
		getCloudflareVitePluginDependencies({
			projectPath: "/test/project",
			target: "wrangler",
		});

		expect(getInstalledPackageVersion).toHaveBeenCalledWith(
			"vite",
			"/test/project"
		);
	});
});
