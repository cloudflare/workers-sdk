import { mockConsoleMethods } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { AutoConfigFrameworkConfigurationError } from "../../src/errors";
import { getFrameworkPackageInfo } from "../../src/frameworks/all-frameworks";
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
		return { workerConfig: null };
	}
}

const PACKAGE_INFO: AutoConfigFrameworkPackageInfo = {
	name: "some-pkg",
	minimumVersion: "2.0.0",
	maximumKnownMajorVersion: "4",
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

	it.for([
		{ target: "cf", reactRouter: "8.5.1", dev: "8.5.1", throws: false },
		{ target: "cf", reactRouter: "8.5.0", dev: "8.5.0", throws: true },
		// `@react-router/dev` carries the fix, so `react-router@latest` alone isn't enough
		{ target: "cf", reactRouter: "8.5.1", dev: "8.5.0", throws: true },
		{ target: "wrangler", reactRouter: "7.0.0", dev: "7.0.0", throws: false },
	] as const)(
		"checks the React Router version for $target (react-router $reactRouter, @react-router/dev $dev)",
		({ target, reactRouter, dev, throws }, { expect }) => {
			const versions: Record<string, string> = {
				"react-router": reactRouter,
				"@react-router/dev": dev,
			};
			vi.mocked(getInstalledPackageVersion).mockImplementation(
				(name) => versions[name]
			);
			const framework = new TestFramework({
				id: "react-router",
				name: "React Router",
			});
			const packageInfo = getFrameworkPackageInfo("react-router", target);
			if (packageInfo === undefined) {
				throw new Error("Expected React Router to have package information");
			}

			const validate = () =>
				framework.validateFrameworkVersion("/project", packageInfo, context);
			if (throws) {
				expect(validate).toThrow(AutoConfigFrameworkConfigurationError);
			} else {
				expect(validate).not.toThrow();
			}
		}
	);

	it("requires SolidStart 2 for cf", ({ expect }) => {
		vi.mocked(getInstalledPackageVersion).mockReturnValue("1.3.2");
		const framework = new TestFramework({
			id: "solid-start",
			name: "Solid Start",
		});
		const validate = (target: "cf" | "wrangler") => () => {
			const packageInfo = getFrameworkPackageInfo("solid-start", target);
			if (packageInfo === undefined) {
				throw new Error("Expected SolidStart to have package information");
			}
			framework.validateFrameworkVersion("/project", packageInfo, context);
		};

		expect(validate("cf")).toThrow(AutoConfigFrameworkConfigurationError);
		expect(validate("wrangler")).not.toThrow();
	});

	it("does not warn for Astro 7", ({ expect }) => {
		vi.mocked(getInstalledPackageVersion).mockReturnValue("7.3.0");
		const framework = new TestFramework({ id: "astro", name: "Astro" });
		const packageInfo = getFrameworkPackageInfo("astro", "cf");

		expect(packageInfo).toBeDefined();
		if (packageInfo === undefined) {
			throw new Error("Expected Astro to have package information");
		}
		framework.validateFrameworkVersion("/project", packageInfo, context);

		expect(framework.frameworkVersion).toBe("7.3.0");
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
