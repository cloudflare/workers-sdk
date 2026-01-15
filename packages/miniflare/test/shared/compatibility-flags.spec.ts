import { describe, expect, it } from "vitest";
import { getWorkerdFeatureFlags } from "../../src/shared/compatibility-flags";

describe("getWorkerdFeatureFlags", () => {
	it("should enable flags based on compatibility date", () => {
		const result = getWorkerdFeatureFlags("2022-01-01", []);

		// These flags should be enabled because the date is after their enable date
		expect(result.formDataParserSupportsFiles).toBe(true); // enabled 2021-11-03
		expect(result.fetchRefusesUnknownProtocols).toBe(true); // enabled 2021-11-10
		expect(result.durableObjectFetchRequiresSchemeAuthority).toBe(true); // enabled 2021-11-10
	});

	it("should not enable flags before their enable date", () => {
		const result = getWorkerdFeatureFlags("2021-01-01", []);

		// These flags should not be enabled because the date is before their enable date
		expect(result.formDataParserSupportsFiles).toBe(false); // enabled 2021-11-03
		expect(result.fetchRefusesUnknownProtocols).toBe(false); // enabled 2021-11-10
	});

	it("should enable flags explicitly via compatibility flags", () => {
		const result = getWorkerdFeatureFlags("2020-01-01", [
			"formdata_parser_supports_files",
		]);

		// This flag should be enabled even though the date is before its enable date
		expect(result.formDataParserSupportsFiles).toBe(true);
	});

	it("should disable flags explicitly via disable flags", () => {
		const result = getWorkerdFeatureFlags("2022-01-01", [
			"formdata_parser_converts_files_to_strings",
		]);

		// This flag should be disabled even though the date is after its enable date
		expect(result.formDataParserSupportsFiles).toBe(false);
	});

	it("should handle implied flags (nodejs_compat implies nodejs_compat_v2 after date)", () => {
		const result = getWorkerdFeatureFlags("2024-09-23", ["nodejs_compat"]);

		expect(result.nodeJsCompat).toBe(true);
		expect(result.nodeJsCompatV2).toBe(true); // implied by nodejs_compat after 2024-09-23
	});

	it("should not imply flags before the implication date", () => {
		const result = getWorkerdFeatureFlags("2024-09-22", ["nodejs_compat"]);

		expect(result.nodeJsCompat).toBe(true);
		expect(result.nodeJsCompatV2).toBe(false); // not yet implied (date is 2024-09-22)
	});

	it("should handle multiple implied flags (nodejs_zlib)", () => {
		const result = getWorkerdFeatureFlags("2024-09-23", ["nodejs_compat"]);

		expect(result.nodeJsCompat).toBe(true);
		expect(result.nodeJsZlib).toBe(true); // implied by nodejs_compat after 2024-09-23
	});

	it("should throw on invalid date format", () => {
		expect(() => getWorkerdFeatureFlags("invalid-date", [])).toThrow(
			/Invalid compatibility date format/
		);
		expect(() => getWorkerdFeatureFlags("2024/01/01", [])).toThrow(
			/Invalid compatibility date format/
		);
		expect(() => getWorkerdFeatureFlags("01-01-2024", [])).toThrow(
			/Invalid compatibility date format/
		);
	});

	it("should throw on unknown compatibility flag", () => {
		expect(() =>
			getWorkerdFeatureFlags("2023-01-01", ["unknown_flag"])
		).toThrow(/Unknown compatibility flag/);
	});

	it("should return all flags with boolean values", () => {
		const result = getWorkerdFeatureFlags("2023-01-01", []);

		// Should have many flags (100+)
		expect(Object.keys(result).length).toBeGreaterThan(100);

		// All values should be boolean
		for (const [, value] of Object.entries(result)) {
			expect(typeof value).toBe("boolean");
		}
	});

	it("should allow experimental flags when requested", () => {
		const result = getWorkerdFeatureFlags("2023-01-01", ["experimental"]);

		// The "experimental" flag is marked as experimental
		expect(result.workerdExperimental).toBe(true);
	});

	it("should handle disable flag overriding date-based enablement", () => {
		// First verify the flag is enabled by date
		const resultBefore = getWorkerdFeatureFlags("2022-01-01", []);
		expect(resultBefore.fetchRefusesUnknownProtocols).toBe(true);

		// Now disable it explicitly
		const resultAfter = getWorkerdFeatureFlags("2022-01-01", [
			"fetch_treats_unknown_protocols_as_http",
		]);
		expect(resultAfter.fetchRefusesUnknownProtocols).toBe(false);
	});

	it("should handle both enable and disable flags correctly", () => {
		// Enable flag should override date
		const result1 = getWorkerdFeatureFlags("2020-01-01", [
			"fetch_refuses_unknown_protocols",
		]);
		expect(result1.fetchRefusesUnknownProtocols).toBe(true);

		// Disable flag should override everything (even explicit enable)
		const result2 = getWorkerdFeatureFlags("2022-01-01", [
			"fetch_refuses_unknown_protocols",
			"fetch_treats_unknown_protocols_as_http",
		]);
		expect(result2.fetchRefusesUnknownProtocols).toBe(false);
	});

	it("should handle flags without enable dates", () => {
		const result = getWorkerdFeatureFlags("2023-01-01", []);

		// These flags don't have enable dates, should be false by default
		expect(result.esiIncludeIsVoidTag).toBe(false);

		// But can be enabled explicitly
		const result2 = getWorkerdFeatureFlags("2023-01-01", [
			"html_rewriter_treats_esi_include_as_void_tag",
		]);
		expect(result2.esiIncludeIsVoidTag).toBe(true);
	});

	it("should handle complex implied flag chains", () => {
		// nodeJsCompatV2 is implied by nodeJsCompat after 2024-09-23
		// Other flags are also implied by nodeJsCompat or nodeJsCompatV2
		const result = getWorkerdFeatureFlags("2024-09-23", ["nodejs_compat"]);

		expect(result.nodeJsCompat).toBe(true);
		expect(result.nodeJsCompatV2).toBe(true); // implied
		expect(result.nodeJsZlib).toBe(true); // implied by both nodejs_compat and nodejs_compat_v2
	});

	it("should handle future dates", () => {
		// Should allow any date (no future date rejection)
		const result = getWorkerdFeatureFlags("2099-12-31", []);

		// All date-based flags should be enabled
		expect(result.formDataParserSupportsFiles).toBe(true);
		expect(result.fetchRefusesUnknownProtocols).toBe(true);
		expect(
			Object.values(result).filter((v) => v === true).length
		).toBeGreaterThan(50);
	});
});
