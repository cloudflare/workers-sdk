import { describe, it, vi } from "vitest";
import { AutoConfigFrameworkConfigurationError } from "../../../autoconfig/errors";
import { Framework } from "../../../autoconfig/frameworks/framework-class";
import { getInstalledPackageVersion } from "../../../autoconfig/frameworks/utils/packages";
import { mockConsoleMethods } from "../../helpers/mock-console";
import type { AutoConfigFrameworkPackageInfo } from "../../../autoconfig/frameworks";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "../../../autoconfig/frameworks/framework-class";

vi.mock("../../../autoconfig/frameworks/utils/packages");

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

describe("Framework.validateFrameworkVersion()", () => {
	const std = mockConsoleMethods();

	it("throws an AssertionError when the package version cannot be determined", ({
		expect,
	}) => {
		vi.mocked(getInstalledPackageVersion).mockReturnValue(undefined);
		const framework = new TestFramework({ id: "test", name: "Test" });

		expect(() =>
			framework.validateFrameworkVersion("/project", PACKAGE_INFO)
		).toThrow("Unable to detect the version of the `some-pkg` package");
	});

	it("throws AutoConfigFrameworkConfigurationError when installed version is below minimum", ({
		expect,
	}) => {
		vi.mocked(getInstalledPackageVersion).mockReturnValue("1.0.0");
		const framework = new TestFramework({ id: "test", name: "Test" });

		expect(() =>
			framework.validateFrameworkVersion("/project", PACKAGE_INFO)
		).toThrow(AutoConfigFrameworkConfigurationError);

		expect(() =>
			framework.validateFrameworkVersion("/project", PACKAGE_INFO)
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
			framework.validateFrameworkVersion("/project", PACKAGE_INFO)
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
			framework.validateFrameworkVersion("/project", PACKAGE_INFO)
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
			framework.validateFrameworkVersion("/project", PACKAGE_INFO)
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
			framework.validateFrameworkVersion("/project", PACKAGE_INFO)
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
			framework.validateFrameworkVersion("/project", PACKAGE_INFO)
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
			framework.validateFrameworkVersion("/project", PACKAGE_INFO)
		).not.toThrow();
		expect(framework.frameworkVersion).toBe("5.0.0");
		expect(std.warn).toContain('"5.0.0"');
		expect(std.warn).toContain("Test");
		expect(std.warn).toContain("is not officially supported");
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
