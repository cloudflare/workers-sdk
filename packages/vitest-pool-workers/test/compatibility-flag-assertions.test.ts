import { describe, it } from "vitest";
import { CompatibilityFlagAssertions } from "../src/pool/compatibility-flag-assertions";

describe("FlagAssertions", () => {
	const baseOptions = {
		optionsPath: "options",
		relativeProjectPath: "/path/to/project",
	};
	describe("assertDisableFlagNotPresent", () => {
		it("returns error message when the flag is present", ({ expect }) => {
			const options = {
				...baseOptions,
				compatibilityFlags: ["disable-flag", "another-flag"],
			};
			const flagAssertions = new CompatibilityFlagAssertions(options);
			const result = flagAssertions.assertIsEnabled({
				disableFlag: "disable-flag",
				enableFlag: "enable-flag",
			});
			expect(result.isValid).toBe(false);
			expect(result.errorMessage).toBe(
				'In project /path/to/project, `options.compatibilityFlags` must not contain "disable-flag".\nThis flag is incompatible with `@cloudflare/vitest-pool-workers`.'
			);
		});

		it("includes relativeWranglerConfigPath in error message when provided", ({
			expect,
		}) => {
			const options = {
				...baseOptions,
				compatibilityFlags: ["disable-flag"],
			};
			const flagAssertions = new CompatibilityFlagAssertions(options);
			const result = flagAssertions.assertIsEnabled({
				disableFlag: "disable-flag",
				enableFlag: "enable-flag",
			});
			expect(result.isValid).toBe(false);
			expect(result.errorMessage).toBe(
				'In project /path/to/project, `options.compatibilityFlags` must not contain "disable-flag".\nThis flag is incompatible with `@cloudflare/vitest-pool-workers`.'
			);
		});

		it("correctly formats error message when relative Wrangler configPath is present", ({
			expect,
		}) => {
			const options = {
				...baseOptions,
				compatibilityFlags: ["disable-flag"],
				relativeWranglerConfigPath: "wrangler.toml",
			};
			const flagAssertions = new CompatibilityFlagAssertions(options);
			const result = flagAssertions.assertIsEnabled({
				disableFlag: "disable-flag",
				enableFlag: "enable-flag",
			});
			expect(result.isValid).toBe(false);
			expect(result.errorMessage).toBe(
				'In project /path/to/project\'s configuration file wrangler.toml, `compatibility_flags` must not contain "disable-flag".\nThis flag is incompatible with `@cloudflare/vitest-pool-workers`.'
			);
		});
	});

	describe("assertEnableFlagOrCompatibilityDate", () => {
		it("returns true when the flag is present", ({ expect }) => {
			const options = {
				...baseOptions,
				compatibilityDate: "2022-12-31",
				compatibilityFlags: ["enable-flag"],
			};
			const flagAssertions = new CompatibilityFlagAssertions(options);
			const result = flagAssertions.assertIsEnabled({
				defaultOnDate: "2023-01-01",
				disableFlag: "disable-flag",
				enableFlag: "enable-flag",
			});
			expect(result.isValid).toBe(true);
		});

		it("returns true when compatibility date is sufficient", ({ expect }) => {
			const options = {
				...baseOptions,
				compatibilityDate: "2023-01-02",
				compatibilityFlags: [],
			};
			const flagAssertions = new CompatibilityFlagAssertions(options);
			const result = flagAssertions.assertIsEnabled({
				disableFlag: "disable-flag",
				enableFlag: "enable-flag",
				defaultOnDate: "2023-01-01",
			});
			expect(result.isValid).toBe(true);
		});

		it("returns error message when neither flag is present nor date is sufficient", ({
			expect,
		}) => {
			const options = {
				...baseOptions,
				compatibilityDate: "2022-12-31",
				compatibilityFlags: [],
			};
			const flagAssertions = new CompatibilityFlagAssertions(options);
			const result = flagAssertions.assertIsEnabled({
				disableFlag: "disable-flag",
				enableFlag: "enable-flag",
				defaultOnDate: "2023-01-01",
			});
			expect(result.isValid).toBe(false);
			expect(result.errorMessage).toBe(
				'In project /path/to/project, `options.compatibilityFlags` must contain "enable-flag", or `options.compatibilityDate` must be >= "2023-01-01".\nThis flag is required to use `@cloudflare/vitest-pool-workers`.'
			);
		});

		it("returns error message when compatibilityDate is undefined", ({
			expect,
		}) => {
			const options = {
				...baseOptions,
				compatibilityDate: undefined,
				compatibilityFlags: [],
			};
			const flagAssertions = new CompatibilityFlagAssertions(options);
			const result = flagAssertions.assertIsEnabled({
				disableFlag: "disable-flag",
				enableFlag: "enable-flag",
				defaultOnDate: "2023-01-01",
			});
			expect(result.isValid).toBe(false);
			expect(result.errorMessage).toBe(
				'In project /path/to/project, `options.compatibilityFlags` must contain "enable-flag", or `options.compatibilityDate` must be >= "2023-01-01".\nThis flag is required to use `@cloudflare/vitest-pool-workers`.'
			);
		});

		it("throws error when defaultOnDate is invalid", ({ expect }) => {
			const options = {
				...baseOptions,
				compatibilityDate: "2023-01-02",
				compatibilityFlags: [],
			};
			const flagAssertions = new CompatibilityFlagAssertions(options);
			expect(() => {
				flagAssertions.assertIsEnabled({
					disableFlag: "disable-flag",
					enableFlag: "enable-flag",
					defaultOnDate: "invalid-date",
				});
			}).toThrowError('Invalid date format: "invalid-date"');
		});

		it("throws error when compatibilityDate is invalid", ({ expect }) => {
			const options = {
				...baseOptions,
				compatibilityDate: "invalid-date",
				compatibilityFlags: [],
			};
			const flagAssertions = new CompatibilityFlagAssertions(options);
			expect(() => {
				flagAssertions.assertIsEnabled({
					disableFlag: "disable-flag",
					enableFlag: "enable-flag",
					defaultOnDate: "2023-01-01",
				});
			}).toThrowError('Invalid date format: "invalid-date"');
		});
	});

	describe("assertAtLeastOneFlagExists", () => {
		it("returns true when at least one of the flags is present", ({
			expect,
		}) => {
			const options = {
				...baseOptions,
				compatibilityDate: "2020-01-01",
				compatibilityFlags: ["flag1", "flag2"],
			};
			const flagAssertions = new CompatibilityFlagAssertions(options);
			const result = flagAssertions.assertAtLeastOneFlagExists(["flag1"]);
			expect(result.isValid).toBe(true);
		});

		it("returns true when multiple flags are present", ({ expect }) => {
			const options = {
				...baseOptions,
				compatibilityDate: "2020-01-01",
				compatibilityFlags: ["flag1", "flag2", "flag3"],
			};
			const flagAssertions = new CompatibilityFlagAssertions(options);
			const result = flagAssertions.assertAtLeastOneFlagExists([
				"flag2",
				"flag3",
			]);
			expect(result.isValid).toBe(true);
		});

		it("returns false when none of the flags are present", ({ expect }) => {
			const options = {
				...baseOptions,
				compatibilityDate: "2020-01-01",
				compatibilityFlags: ["flag1"],
			};
			const flagAssertions = new CompatibilityFlagAssertions(options);
			const result = flagAssertions.assertAtLeastOneFlagExists([
				"flag2",
				"flag3",
			]);
			expect(result.isValid).toBe(false);
			expect(result.errorMessage).toBe(
				'In project /path/to/project, `options.compatibilityFlags` must contain one of "flag2"/"flag3".\nEither one of these flags is required to use `@cloudflare/vitest-pool-workers`.'
			);
		});

		it("includes relativeWranglerConfigPath in error message when provided", ({
			expect,
		}) => {
			const options = {
				...baseOptions,
				compatibilityDate: "2020-01-01",
				compatibilityFlags: [],
				relativeWranglerConfigPath: "wrangler.toml",
			};
			const flagAssertions = new CompatibilityFlagAssertions(options);
			const result = flagAssertions.assertAtLeastOneFlagExists([
				"flag2",
				"flag3",
			]);
			expect(result.isValid).toBe(false);
			expect(result.errorMessage).toBe(
				'In project /path/to/project\'s configuration file wrangler.toml, `compatibility_flags` must contain one of "flag2"/"flag3".\nEither one of these flags is required to use `@cloudflare/vitest-pool-workers`.'
			);
		});

		it("returns true when all flags are present", ({ expect }) => {
			const options = {
				...baseOptions,
				compatibilityDate: "2020-01-01",
				compatibilityFlags: ["flag1", "flag2", "flag3"],
			};
			const flagAssertions = new CompatibilityFlagAssertions(options);
			const result = flagAssertions.assertAtLeastOneFlagExists([
				"flag1",
				"flag2",
				"flag3",
			]);
			expect(result.isValid).toBe(true);
		});

		it("returns false when compatibilityFlags is empty", ({ expect }) => {
			const options = {
				...baseOptions,
				compatibilityDate: "2020-01-01",
				compatibilityFlags: [],
			};
			const flagAssertions = new CompatibilityFlagAssertions(options);
			const result = flagAssertions.assertAtLeastOneFlagExists([
				"flag1",
				"flag2",
			]);
			expect(result.isValid).toBe(false);
			expect(result.errorMessage).toBe(
				'In project /path/to/project, `options.compatibilityFlags` must contain one of "flag1"/"flag2".\nEither one of these flags is required to use `@cloudflare/vitest-pool-workers`.'
			);
		});

		it("returns true when flags array is empty", ({ expect }) => {
			const options = {
				...baseOptions,
				compatibilityDate: "2020-01-01",
				compatibilityFlags: ["flag1"],
			};
			const flagAssertions = new CompatibilityFlagAssertions(options);
			const result = flagAssertions.assertAtLeastOneFlagExists([]);
			expect(result.isValid).toBe(true);
		});
	});
});
