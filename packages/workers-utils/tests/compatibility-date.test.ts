import { describe, it, test } from "vitest";
import {
	isCompatDate,
	getTodaysCompatDate,
	isNodejsCompatDefaultOn,
	NODEJS_COMPAT_DEFAULT_ON_DATE,
	resolveNodejsCompat,
} from "../src/compatibility-date";

describe("getTodaysCompatDate()", () => {
	it("should be a valid compat date in YYYY-MM-DD format", ({ expect }) => {
		expect(isCompatDate(getTodaysCompatDate())).toBe(true);
	});

	it("should equal today's UTC date", ({ expect }) => {
		const expected = new Date().toISOString().slice(0, 10);
		expect(getTodaysCompatDate()).toBe(expected);
	});
});

describe("isCompatDate", () => {
	it("should return true for valid compat dates", ({ expect }) => {
		expect(isCompatDate("2025-01-10")).toBe(true);
		expect(isCompatDate("2000-12-31")).toBe(true);
	});

	it("should return false for invalid compat dates", ({ expect }) => {
		expect(isCompatDate("2025-1-10")).toBe(false);
		expect(isCompatDate("not-a-date")).toBe(false);
		expect(isCompatDate("")).toBe(false);
		expect(isCompatDate("2025-01-101")).toBe(false);
	});
});

describe("isNodejsCompatDefaultOn", () => {
	it("should return true from the default-on date onwards", ({ expect }) => {
		expect(isNodejsCompatDefaultOn(NODEJS_COMPAT_DEFAULT_ON_DATE)).toBe(true);
		expect(isNodejsCompatDefaultOn("2026-08-05")).toBe(true);
		expect(isNodejsCompatDefaultOn("2030-01-01")).toBe(true);
	});

	it("should return false before the default-on date", ({ expect }) => {
		expect(isNodejsCompatDefaultOn("2026-08-03")).toBe(false);
		expect(isNodejsCompatDefaultOn("2024-09-23")).toBe(false);
		expect(isNodejsCompatDefaultOn("")).toBe(false);
	});

	it("should return false when there is no date", ({ expect }) => {
		expect(isNodejsCompatDefaultOn(undefined)).toBe(false);
	});
});

describe("resolveNodejsCompat", () => {
	// [compatibilityDate, compatibilityFlags, nodejs_compat, nodejs_compat_v2]
	const cases: [string, string[], boolean, boolean][] = [
		// Nothing enables it before the default-on date
		["2024-09-22", [], false, false],
		["2026-08-03", [], false, false],
		// `nodejs_compat` only implies v2 from the switch over date onwards
		["2024-09-22", ["nodejs_compat"], true, false],
		["2024-09-23", ["nodejs_compat"], true, true],
		// `nodejs_compat_v2` can be enabled on its own
		["2024-09-22", ["nodejs_compat_v2"], false, true],
		// Both are on by default from the default-on date, without any flags
		["2026-08-04", [], true, true],
		["2030-01-01", [], true, true],
		// From the default-on date each has to be disabled separately
		["2026-08-04", ["no_nodejs_compat"], false, true],
		["2026-08-04", ["no_nodejs_compat_v2"], true, false],
		["2026-08-04", ["no_nodejs_compat", "no_nodejs_compat_v2"], false, false],
		// An explicit flag still wins over the matching opt-out
		["2026-08-04", ["nodejs_compat", "no_nodejs_compat"], true, true],
		// Unrelated flags make no difference
		["2026-08-04", ["nodejs_als"], true, true],
		["2024-09-22", ["nodejs_als"], false, false],
	];

	test.for(cases)(
		"%s with %j",
		([compatibilityDate, flags, nodejsCompat, nodejsCompatV2], { expect }) => {
			expect(resolveNodejsCompat(compatibilityDate, flags)).toEqual({
				isNodejsCompatEnabled: nodejsCompat,
				isNodejsCompatV2Enabled: nodejsCompatV2,
			});
		}
	);
});
