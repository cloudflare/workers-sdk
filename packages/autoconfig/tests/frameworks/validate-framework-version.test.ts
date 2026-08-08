import { mockConsoleMethods } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { AutoConfigFrameworkConfigurationError } from "../../src/errors";
import { Framework } from "../../src/frameworks/framework-class";
import { getInstalledPackageVersion } from "../../src/frameworks/utils/packages";
import { createMockContext } from "../helpers/mock-context";
import type { AutoConfigFrameworkPackageInfo } from "../../src/frameworks";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "../../src/frameworks/framework-class";

vi.mock("../../src/frameworks/utils/packages");

/** Minimal concrete subclass so we can instantiate the abstract Framework */
class TestFramework extends Framework {
	configure(_options: ConfigurationOptions): ConfigurationResults {
		return { wranglerConfig: null };
	}
}

const PACKAGE_INFO: AutoConfigFrameworkPackageInfo = {
	name: "some-pkg",
	minimumVersion: "2.0.0",
	maximumKnownMajorVersion: "4",
};

const PACKAGE_INFO_WITH_UPGRADES: AutoConfigFrameworkPackageInfo = {
	...PACKAGE_INFO,
	upgradeRequired: {
		">=1.5 <2": "2.0.0",
		">=2 <2.5.0": "2.5.0",
		">=3 <3.1.0": "3.1.0",
	},
};

describe("Framework.validateFrameworkVersion()", () => {
	const std = mockConsoleMethods();
	const context = createMockContext();

	it("throws an AssertionError when the package version cannot be determined", ({
		expect,
	}) => {
		vi.mocked(getInstalledPackageVersion).mockReturnValue(undefined);
		const framework = new TestFramework({ id: "test", name: "Test" });

		expect(() =>
			framework.validateFrameworkVersion("/project", PACKAGE_INFO, context)
		).toThrow("Unable to detect the version of the `some-pkg` package");
	});

	it("throws AutoConfigFrameworkConfigurationError when installed version is below minimum", ({
		expect,
	}) => {
		vi.mocked(getInstalledPackageVersion).mockReturnValue("1.0.0");
		const framework = new TestFramework({ id: "test", name: "Test" });

		expect(() =>
			framework.validateFrameworkVersion("/project", PACKAGE_INFO, context)
		).toThrow(AutoConfigFrameworkConfigurationError);

		expect(() =>
			framework.validateFrameworkVersion("/project", PACKAGE_INFO, context)
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: The version of Test used in the project ("1.0.0") cannot be automatically configured. Please update the Test version to at least "2.0.0" and try again.]`
		);
	});

	it("does not throw and sets frameworkVersion when installed version equals minimumVersion", ({
		expect,
	}) => {
		vi.mocked(getInstalledPackageVersion).mockReturnValue("2.0.0");
		const framework = new TestFramework({ id: "test", name: "Test" });

		expect(() =>
			framework.validateFrameworkVersion("/project", PACKAGE_INFO, context)
		).not.toThrow();
		expect(framework.frameworkVersion).toBe("2.0.0");
		expect(std.warn).toBe("");
	});

	it("does not throw and sets frameworkVersion when installed version is within known range", ({
		expect,
	}) => {
		vi.mocked(getInstalledPackageVersion).mockReturnValue("3.0.0");
		const framework = new TestFramework({ id: "test", name: "Test" });

		expect(() =>
			framework.validateFrameworkVersion("/project", PACKAGE_INFO, context)
		).not.toThrow();
		expect(framework.frameworkVersion).toBe("3.0.0");
		expect(std.warn).toBe("");
	});

	it("does not throw and does not warn when installed version equals maximumKnownMajorVersion", ({
		expect,
	}) => {
		vi.mocked(getInstalledPackageVersion).mockReturnValue("4.0.0");
		const framework = new TestFramework({ id: "test", name: "Test" });

		expect(() =>
			framework.validateFrameworkVersion("/project", PACKAGE_INFO, context)
		).not.toThrow();
		expect(framework.frameworkVersion).toBe("4.0.0");
		expect(std.warn).toBe("");
	});

	it("does not throw and does not warn when installed version is a minor/patch update within the known major", ({
		expect,
	}) => {
		vi.mocked(getInstalledPackageVersion).mockReturnValue("4.5.0");
		const framework = new TestFramework({ id: "test", name: "Test" });

		expect(() =>
			framework.validateFrameworkVersion("/project", PACKAGE_INFO, context)
		).not.toThrow();
		expect(framework.frameworkVersion).toBe("4.5.0");
		expect(std.warn).toBe("");
	});

	it("does not throw nor warn when the installed version is an update within the known major", ({
		expect,
	}) => {
		vi.mocked(getInstalledPackageVersion).mockReturnValue("4.3.2");
		const framework = new TestFramework({ id: "test", name: "Test" });

		expect(() =>
			framework.validateFrameworkVersion("/project", PACKAGE_INFO, context)
		).not.toThrow();
		expect(framework.frameworkVersion).toBe("4.3.2");
		expect(std.warn).toBe("");
	});

	it("does not throw but warns when installed version exceeds maximumKnownMajorVersion", ({
		expect,
	}) => {
		vi.mocked(getInstalledPackageVersion).mockReturnValue("5.0.0");
		const framework = new TestFramework({ id: "test", name: "Test" });

		expect(() =>
			framework.validateFrameworkVersion("/project", PACKAGE_INFO, context)
		).not.toThrow();
		expect(framework.frameworkVersion).toBe("5.0.0");
		expect(std.warn).toContain('"5.0.0"');
		expect(std.warn).toContain("Test");
		expect(std.warn).toContain("is not officially supported");
	});

	it("returns the target version when the installed version requires an upgrade", ({
		expect,
	}) => {
		const cases = [
			["1.5.5", "2.0.0"],
			["2.0.0", "2.5.0"],
			["2.5.0-beta.1", "2.5.0"],
			["3.0.9", "3.1.0"],
		] as const;

		for (const [installedVersion, upgradeTo] of cases) {
			vi.mocked(getInstalledPackageVersion).mockReturnValue(installedVersion);
			const framework = new TestFramework({ id: "test", name: "Test" });

			expect(
				framework.validateFrameworkVersion(
					"/project",
					PACKAGE_INFO_WITH_UPGRADES,
					context
				)
			).toEqual({ installedVersion, upgradeTo });
			// The version is recorded even though it still needs upgrading
			expect(framework.frameworkVersion).toBe(installedVersion);
		}
	});

	it("does not return an upgrade at the target-version boundary", ({
		expect,
	}) => {
		vi.mocked(getInstalledPackageVersion).mockReturnValue("2.5.0");
		const framework = new TestFramework({ id: "test", name: "Test" });

		expect(
			framework.validateFrameworkVersion(
				"/project",
				PACKAGE_INFO_WITH_UPGRADES,
				context
			)
		).toBeUndefined();
	});

	it("returns an upgrade instead of rejecting a below-minimum version", ({
		expect,
	}) => {
		vi.mocked(getInstalledPackageVersion).mockReturnValue("1.5.5");
		const framework = new TestFramework({ id: "test", name: "Test" });

		expect(
			framework.validateFrameworkVersion(
				"/project",
				PACKAGE_INFO_WITH_UPGRADES,
				context
			)
		).toEqual({ installedVersion: "1.5.5", upgradeTo: "2.0.0" });
		expect(std.warn).toBe("");
	});

	it("throws an AssertionError when frameworkVersion getter is accessed before validateFrameworkVersion is called", ({
		expect,
	}) => {
		const framework = new TestFramework({ id: "test", name: "Test" });

		expect(() => framework.frameworkVersion).toThrow(
			'The version for "Test" is unexpectedly missing'
		);
	});
});
