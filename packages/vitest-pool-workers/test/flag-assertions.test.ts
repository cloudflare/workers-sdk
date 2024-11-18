import { describe, expect, it } from "vitest";
import { FlagAssertions } from "../src/pool/flag-assertions";

describe("FlagAssertions", () => {
	const baseOptions = {
		optionsPath: "options",
		relativeProjectPath: "/path/to/project",
	};
	describe("assertDisableFlagNotPresent", () => {
		it("returns true when the flag is not present", () => {
			const options = {
				...baseOptions,
				compatibilityFlags: ["some-other-flag"],
			};
			const flagAssertions = new FlagAssertions(options);
			const result = flagAssertions.assertDisableFlagNotPresent("test-flag");
			expect(result.isValid).toBe(true);
		});

		it("returns error message when the flag is present", () => {
			const options = {
				...baseOptions,
				compatibilityFlags: ["test-flag", "another-flag"],
			};
			const flagAssertions = new FlagAssertions(options);
			const result = flagAssertions.assertDisableFlagNotPresent("test-flag");
			expect(result.isValid).toBe(false);
			expect(result.errorMessage).toBe(
				'In project /path/to/project, `options.compatibilityFlags` must not contain "test-flag".\nThis flag is incompatible with `@cloudflare/vitest-pool-workers`.'
			);
		});

		it("includes relativeWranglerConfigPath in error message when provided", () => {
			const options = {
				...baseOptions,
				compatibilityFlags: ["test-flag"],
			};
			const flagAssertions = new FlagAssertions(options);
			const result = flagAssertions.assertDisableFlagNotPresent("test-flag");
			expect(result.isValid).toBe(false);
			expect(result.errorMessage).toBe(
				'In project /path/to/project, `options.compatibilityFlags` must not contain "test-flag".\nThis flag is incompatible with `@cloudflare/vitest-pool-workers`.'
			);
		});

		it("correctly formats error message when relative Wrangler configPath is present", () => {
			const options = {
				...baseOptions,
				compatibilityFlags: ["test-flag"],
				relativeWranglerConfigPath: "wrangler.toml",
			};
			const flagAssertions = new FlagAssertions(options);
			const result = flagAssertions.assertDisableFlagNotPresent("test-flag");
			expect(result.isValid).toBe(false);
			expect(result.errorMessage).toBe(
				'In project /path/to/project\'s configuration file wrangler.toml, `compatibility_flags` must not contain "test-flag".\nThis flag is incompatible with `@cloudflare/vitest-pool-workers`.'
			);
		});
	});

	describe("assertEnableFlagOrCompatibilityDate", () => {
		it("returns true when the flag is present", () => {
			const options = {
				...baseOptions,
				compatibilityFlags: ["test-flag"],
			};
			const flagAssertions = new FlagAssertions(options);
			const dateOptions = {
				defaultOnDate: "2023-01-01",
				compatibilityDate: "2022-12-31",
			};
			const result = flagAssertions.assertEnableFlagOrCompatibilityDate(
				"test-flag",
				dateOptions
			);
			expect(result.isValid).toBe(true);
		});

		it("returns true when compatibility date is sufficient", () => {
			const options = {
				...baseOptions,
				compatibilityFlags: [],
			};
			const flagAssertions = new FlagAssertions(options);
			const dateOptions = {
				defaultOnDate: "2023-01-01",
				compatibilityDate: "2023-01-02",
			};
			const result = flagAssertions.assertEnableFlagOrCompatibilityDate(
				"test-flag",
				dateOptions
			);
			expect(result.isValid).toBe(true);
		});

		it("returns error message when neither flag is present nor date is sufficient", () => {
			const options = {
				...baseOptions,
				compatibilityFlags: [],
			};
			const flagAssertions = new FlagAssertions(options);
			const dateOptions = {
				defaultOnDate: "2023-01-01",
				compatibilityDate: "2022-12-31",
			};
			const result = flagAssertions.assertEnableFlagOrCompatibilityDate(
				"test-flag",
				dateOptions
			);
			expect(result.isValid).toBe(false);
			expect(result.errorMessage).toBe(
				'In project /path/to/project, `options.compatibilityFlags` must contain "test-flag", or `options.compatibilityDate` must be >= "2023-01-01".\nThis flag is required to use `@cloudflare/vitest-pool-workers`.'
			);
		});

		it("returns error message when compatibilityDate is undefined", () => {
			const options = {
				...baseOptions,
				compatibilityFlags: [],
			};
			const flagAssertions = new FlagAssertions(options);
			const dateOptions = {
				defaultOnDate: "2023-01-01",
				compatibilityDate: undefined,
			};
			const result = flagAssertions.assertEnableFlagOrCompatibilityDate(
				"test-flag",
				dateOptions
			);
			expect(result.isValid).toBe(false);
			expect(result.errorMessage).toBe(
				'In project /path/to/project, `options.compatibilityFlags` must contain "test-flag", or `options.compatibilityDate` must be >= "2023-01-01".\nThis flag is required to use `@cloudflare/vitest-pool-workers`.'
			);
		});

		it("throws error when defaultOnDate is invalid", () => {
			const options = {
				...baseOptions,
				compatibilityFlags: [],
			};
			const flagAssertions = new FlagAssertions(options);
			const dateOptions = {
				defaultOnDate: "invalid-date",
				compatibilityDate: "2023-01-02",
			};
			expect(() => {
				flagAssertions.assertEnableFlagOrCompatibilityDate(
					"test-flag",
					dateOptions
				);
			}).toThrowError('Invalid date format: "invalid-date"');
		});

		it("throws error when compatibilityDate is invalid", () => {
			const options = {
				...baseOptions,
				compatibilityFlags: [],
			};
			const flagAssertions = new FlagAssertions(options);
			const dateOptions = {
				defaultOnDate: "2023-01-01",
				compatibilityDate: "invalid-date",
			};
			expect(() => {
				flagAssertions.assertEnableFlagOrCompatibilityDate(
					"test-flag",
					dateOptions
				);
			}).toThrowError('Invalid date format: "invalid-date"');
		});
	});

	describe("assertUnionOfEnableFlags", () => {
		it("returns true when at least one of the flags is present", () => {
			const options = {
				...baseOptions,
				compatibilityFlags: ["flag1", "flag2"],
			};
			const flagAssertions = new FlagAssertions(options);
			const result = flagAssertions.assertUnionOfEnableFlags([
				"flag2",
				"flag3",
			]);
			expect(result.isValid).toBe(true);
		});

		it("returns true when multiple flags are present", () => {
			const options = {
				...baseOptions,
				compatibilityFlags: ["flag1", "flag2", "flag3"],
			};
			const flagAssertions = new FlagAssertions(options);
			const result = flagAssertions.assertUnionOfEnableFlags([
				"flag2",
				"flag3",
			]);
			expect(result.isValid).toBe(true);
		});

		it("returns false when none of the flags are present", () => {
			const options = {
				...baseOptions,
				compatibilityFlags: ["flag1"],
			};
			const flagAssertions = new FlagAssertions(options);
			const result = flagAssertions.assertUnionOfEnableFlags([
				"flag2",
				"flag3",
			]);
			expect(result.isValid).toBe(false);
			expect(result.errorMessage).toBe(
				'In project /path/to/project, `options.compatibilityFlags` must contain one of "flag1"/"flag2".\nEither one of these flags is required to use `@cloudflare/vitest-pool-workers`.'
			);
		});

		it("includes relativeWranglerConfigPath in error message when provided", () => {
			const options = {
				...baseOptions,
				compatibilityFlags: [],
				relativeWranglerConfigPath: "wrangler.toml",
			};
			const flagAssertions = new FlagAssertions(options);
			const result = flagAssertions.assertUnionOfEnableFlags([
				"flag2",
				"flag3",
			]);
			expect(result.isValid).toBe(false);
			expect(result.errorMessage).toBe(
				'In project /path/to/project\'s configuration file wrangler.toml, `options.compatibilityFlags` must contain one of "flag1"/"flag2".\nEither one of these flags is required to use `@cloudflare/vitest-pool-workers`.'
			);
		});

		it("returns true when all flags are present", () => {
			const options = {
				...baseOptions,
				compatibilityFlags: ["flag1", "flag2", "flag3"],
			};
			const flagAssertions = new FlagAssertions(options);
			const result = flagAssertions.assertUnionOfEnableFlags([
				"flag1",
				"flag2",
				"flag3",
			]);
			expect(result.isValid).toBe(true);
		});

		it("returns false when compatibilityFlags is empty", () => {
			const options = {
				...baseOptions,
				compatibilityFlags: [],
			};
			const flagAssertions = new FlagAssertions(options);
			const result = flagAssertions.assertUnionOfEnableFlags([
				"flag1",
				"flag2",
			]);
			expect(result.isValid).toBe(false);
			expect(result.errorMessage).toBe(
				'In project /path/to/project, at least one of "flag1", "flag2" must be present to use `@cloudflare/vitest-pool-workers`.'
			);
		});

		it("returns false when flags array is empty", () => {
			const options = {
				...baseOptions,
				compatibilityFlags: ["flag1"],
			};
			const flagAssertions = new FlagAssertions(options);
			const result = flagAssertions.assertUnionOfEnableFlags([]);
			expect(result.isValid).toBe(false);
			expect(result.errorMessage).toBe(
				"In project /path/to/project, at least one of  must be present to use `@cloudflare/vitest-pool-workers`."
			);
		});
	});
});
