import { getNodeCompat } from "miniflare";
import { describe, test } from "vitest";
import type { NodeJSCompatMode } from "miniflare";

// `nodejs_compat` and `nodejs_compat_v2` both became enabled by default in
// workerd on this date.
const DEFAULT_ON_DATE = "2026-08-04";
// Before `DEFAULT_ON_DATE`, `nodejs_compat` implied `nodejs_compat_v2` from
// this date onwards.
const V2_SWITCH_OVER_DATE = "2024-09-23";

const cases: {
	description: string;
	compatibilityDate: string | undefined;
	compatibilityFlags: string[];
	expected: NodeJSCompatMode;
}[] = [
	{
		description: "null when there is no date and no flags",
		compatibilityDate: undefined,
		compatibilityFlags: [],
		expected: null,
	},
	{
		description: "null for an old date and no flags",
		compatibilityDate: "2024-01-01",
		compatibilityFlags: [],
		expected: null,
	},
	{
		description: "als for `nodejs_als` on an old date",
		compatibilityDate: "2024-01-01",
		compatibilityFlags: ["nodejs_als"],
		expected: "als",
	},
	{
		description: "v1 for `nodejs_compat` before the v2 switch over date",
		compatibilityDate: "2024-09-22",
		compatibilityFlags: ["nodejs_compat"],
		expected: "v1",
	},
	{
		description: "v2 for `nodejs_compat` on the v2 switch over date",
		compatibilityDate: V2_SWITCH_OVER_DATE,
		compatibilityFlags: ["nodejs_compat"],
		expected: "v2",
	},
	{
		description:
			"v1 for `nodejs_compat` with `no_nodejs_compat_v2` after the v2 switch over date",
		compatibilityDate: "2025-01-01",
		compatibilityFlags: ["nodejs_compat", "no_nodejs_compat_v2"],
		expected: "v1",
	},
	{
		description: "v2 for `nodejs_compat_v2` on an old date",
		compatibilityDate: "2024-01-01",
		compatibilityFlags: ["nodejs_compat_v2"],
		expected: "v2",
	},
	{
		description: "null for the day before the default on date with no flags",
		compatibilityDate: "2026-08-03",
		compatibilityFlags: [],
		expected: null,
	},
	{
		description: "v2 for the default on date with no flags",
		compatibilityDate: DEFAULT_ON_DATE,
		compatibilityFlags: [],
		expected: "v2",
	},
	{
		description: "v2 after the default on date with no flags",
		compatibilityDate: "2026-12-25",
		compatibilityFlags: [],
		expected: "v2",
	},
	{
		description:
			"v2 for `nodejs_als` after the default on date, since full compat supersedes it",
		compatibilityDate: "2026-12-25",
		compatibilityFlags: ["nodejs_als"],
		expected: "v2",
	},
	{
		description: "v1 for `no_nodejs_compat_v2` after the default on date",
		compatibilityDate: "2026-12-25",
		compatibilityFlags: ["no_nodejs_compat_v2"],
		expected: "v1",
	},
	{
		// `no_nodejs_compat` alone does not disable v2, because `nodejs_compat_v2`
		// has its own default on date in workerd and so must be disabled separately.
		description: "v2 for `no_nodejs_compat` alone after the default on date",
		compatibilityDate: "2026-12-25",
		compatibilityFlags: ["no_nodejs_compat"],
		expected: "v2",
	},
	{
		description: "null for both disable flags after the default on date",
		compatibilityDate: "2026-12-25",
		compatibilityFlags: ["no_nodejs_compat", "no_nodejs_compat_v2"],
		expected: null,
	},
	{
		description:
			"als for `nodejs_als` with both disable flags after the default on date",
		compatibilityDate: "2026-12-25",
		compatibilityFlags: [
			"nodejs_als",
			"no_nodejs_compat",
			"no_nodejs_compat_v2",
		],
		expected: "als",
	},
];

describe("getNodeCompat()", () => {
	test.for(cases)(
		"returns $description",
		({ compatibilityDate, compatibilityFlags, expected }, { expect }) => {
			expect(getNodeCompat(compatibilityDate, compatibilityFlags).mode).toBe(
				expected
			);
		}
	);

	test("reports the flags that were provided", ({ expect }) => {
		expect(
			getNodeCompat("2026-12-25", [
				"nodejs_als",
				"no_nodejs_compat",
				"experimental:nodejs_compat_v2",
			])
		).toEqual({
			mode: "v2",
			// `no_nodejs_compat` disables `nodejs_compat`, but `nodejs_compat_v2` has
			// its own default on date and so remains enabled.
			isNodejsCompatEnabled: false,
			isNodejsCompatV2Enabled: true,
			hasNodejsAlsFlag: true,
			hasNodejsCompatFlag: false,
			hasNoNodejsCompatFlag: true,
			hasNodejsCompatV2Flag: false,
			hasNoNodejsCompatV2Flag: false,
			hasExperimentalNodejsCompatV2Flag: true,
		});
	});

	test("resolves the flags accounting for the compatibility date", ({
		expect,
	}) => {
		// Enabled by the flag, before the default on date
		expect(getNodeCompat("2025-01-01", ["nodejs_compat"])).toMatchObject({
			isNodejsCompatEnabled: true,
			isNodejsCompatV2Enabled: true,
		});
		// Enabled by the date alone
		expect(getNodeCompat("2026-08-04", [])).toMatchObject({
			isNodejsCompatEnabled: true,
			isNodejsCompatV2Enabled: true,
		});
		// Not enabled before the default on date without the flag
		expect(getNodeCompat("2026-08-03", [])).toMatchObject({
			isNodejsCompatEnabled: false,
			isNodejsCompatV2Enabled: false,
		});
	});
});
