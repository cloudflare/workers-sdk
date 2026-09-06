import { describe, it } from "vitest";
import {
	getCompatDateForWorkerdVersion,
	getInstalledWorkerdVersion,
	getPinnedWorkerdCompatDate,
	readDefaultCompatDate,
	setDefaultCompatDate,
} from "../update-default-compat-date";

const SOURCE = `import type { CompatDate } from "./compatibility-date";

/**
 * Docs mentioning an unrelated date such as 2026-08-04.
 */
export const DEFAULT_COMPAT_DATE: CompatDate = "2026-08-11";
`;

describe("getCompatDateForWorkerdVersion()", () => {
	it("should derive the release date from a workerd version", ({ expect }) => {
		expect(getCompatDateForWorkerdVersion("1.20260811.1")).toBe("2026-08-11");
		expect(getCompatDateForWorkerdVersion("1.20260101.0")).toBe("2026-01-01");
		expect(getCompatDateForWorkerdVersion("1.20991231.12")).toBe("2099-12-31");
	});

	it("should reject versions that are not workerd releases", ({ expect }) => {
		// A change to workerd's versioning scheme must fail loudly rather than
		// silently producing a wrong default.
		expect(() => getCompatDateForWorkerdVersion("2.20260811.1")).toThrow(
			/Could not derive a compatibility date/
		);
		expect(() => getCompatDateForWorkerdVersion("1.2.3")).toThrow(
			/Could not derive a compatibility date/
		);
		expect(() => getCompatDateForWorkerdVersion("1.20260811")).toThrow(
			/Could not derive a compatibility date/
		);
	});
});

describe("readDefaultCompatDate()", () => {
	it("should read the declared date and not dates in the docs", ({
		expect,
	}) => {
		expect(readDefaultCompatDate(SOURCE)).toBe("2026-08-11");
	});

	it("should throw when the declaration is missing", ({ expect }) => {
		expect(() => readDefaultCompatDate("export const OTHER = 1;")).toThrow(
			/Could not find the DEFAULT_COMPAT_DATE declaration/
		);
	});
});

describe("setDefaultCompatDate()", () => {
	it("should replace only the declared date", ({ expect }) => {
		const updated = setDefaultCompatDate(SOURCE, "2026-09-02");

		expect(readDefaultCompatDate(updated)).toBe("2026-09-02");
		expect(updated).toContain("unrelated date such as 2026-08-04");
		expect(updated).toContain(
			'export const DEFAULT_COMPAT_DATE: CompatDate = "2026-09-02";'
		);
	});

	it("should throw when the declaration is missing", ({ expect }) => {
		expect(() =>
			setDefaultCompatDate("export const OTHER = 1;", "2026-09-02")
		).toThrow(/Could not find the DEFAULT_COMPAT_DATE declaration/);
	});
});

describe("getInstalledWorkerdVersion()", () => {
	it("should report the installed workerd's version", ({ expect }) => {
		expect(getInstalledWorkerdVersion()).toMatch(/^1\.\d{8}\.\d+$/);
	});
});

describe("getPinnedWorkerdCompatDate()", () => {
	it("should derive the date from the installed workerd", ({ expect }) => {
		// getInstalledWorkerdVersion() throws rather than reporting absence, and a
		// mismatch with the catalog is fatal, so reaching a value here proves the
		// date belongs to the workerd that is actually installed.
		expect(getPinnedWorkerdCompatDate()).toBe(
			getCompatDateForWorkerdVersion(getInstalledWorkerdVersion())
		);
	});
});
