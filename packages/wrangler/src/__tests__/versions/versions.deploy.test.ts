import yargs from "yargs";
import {
	assignAndDistributePercentages,
	parseVersionSpecs,
	summariseVersionTraffic,
	validateTrafficSubtotal,
	versionsDeployOptions,
} from "../../versions/deploy";
import type { VersionsDeployArgs } from "../../versions/deploy";

describe("versions deploy", () => {});

describe("units", () => {
	describe("parseVersionSpecs", () => {
		// @ts-expect-error passing a fresh yargs() as param but it expects one preconfigured with global options
		const options = versionsDeployOptions(yargs());

		test("no args", () => {
			const input = "";

			const args = options.parse(input) as VersionsDeployArgs;
			const result = parseVersionSpecs(args);

			expect(result).toMatchObject(new Map());
		});

		test("1 positional arg", () => {
			const input = "10000000-0000-0000-0000-000000000000@10%";

			const args = options.parse(input) as VersionsDeployArgs;
			const result = parseVersionSpecs(args);

			expect(Object.fromEntries(result)).toMatchObject({
				"10000000-0000-0000-0000-000000000000": 10,
			});
		});
		test("2 positional args", () => {
			const input =
				"10000000-0000-0000-0000-000000000000@10% 20000000-0000-0000-0000-000000000000@90%";

			const args = options.parse(input) as VersionsDeployArgs;
			const result = parseVersionSpecs(args);

			expect(Object.fromEntries(result)).toMatchObject({
				"10000000-0000-0000-0000-000000000000": 10,
				"20000000-0000-0000-0000-000000000000": 90,
			});
		});

		test("1 pair of named args", () => {
			const input =
				"--version-id 10000000-0000-0000-0000-000000000000 --percentage 10";

			const args = options.parse(input) as VersionsDeployArgs;
			const result = parseVersionSpecs(args);

			expect(Object.fromEntries(result)).toMatchObject({
				"10000000-0000-0000-0000-000000000000": 10,
			});
		});
		test("2 pairs of named args", () => {
			const input =
				"--version-id 10000000-0000-0000-0000-000000000000 --percentage 10 --version-id 20000000-0000-0000-0000-000000000000 --percentage 90";

			const args = options.parse(input) as VersionsDeployArgs;
			const result = parseVersionSpecs(args);

			expect(Object.fromEntries(result)).toMatchObject({
				"10000000-0000-0000-0000-000000000000": 10,
				"20000000-0000-0000-0000-000000000000": 90,
			});
		});
		test("unordered named args", () => {
			const input =
				"--version-id 10000000-0000-0000-0000-000000000000 --version-id 20000000-0000-0000-0000-000000000000 --percentage 10 --percentage 90";

			const args = options.parse(input) as VersionsDeployArgs;
			const result = parseVersionSpecs(args);

			expect(Object.fromEntries(result)).toMatchObject({
				"10000000-0000-0000-0000-000000000000": 10,
				"20000000-0000-0000-0000-000000000000": 90,
			});
		});
		test("unpaired named args", () => {
			const input =
				"--version-id 10000000-0000-0000-0000-000000000000 --percentage 10 --version-id 20000000-0000-0000-0000-000000000000";

			const args = options.parse(input) as VersionsDeployArgs;
			const result = parseVersionSpecs(args);

			expect(Object.fromEntries(result)).toMatchObject({
				"10000000-0000-0000-0000-000000000000": 10,
				"20000000-0000-0000-0000-000000000000": null,
			});
		});
		test("unpaired, unordered named args", () => {
			const input =
				"--version-id 10000000-0000-0000-0000-000000000000 --version-id 20000000-0000-0000-0000-000000000000 --percentage 10";

			const args = options.parse(input) as VersionsDeployArgs;
			const result = parseVersionSpecs(args);

			expect(Object.fromEntries(result)).toMatchObject({
				"10000000-0000-0000-0000-000000000000": 10,
				"20000000-0000-0000-0000-000000000000": null,
			});
		});
	});

	describe("assignAndDistributePercentages distributes remaining share of 100%", () => {
		test.each`
			description                                              | versionIds                  | optionalVersionTraffic | expected
			${"from 1 specified value across 1 unspecified value"}   | ${["v1", "v2"]}             | ${{ v1: 10 }}          | ${{ v1: 10, v2: 90 }}
			${"from 1 specified value across 2 unspecified values"}  | ${["v1", "v2", "v3"]}       | ${{ v1: 10 }}          | ${{ v1: 10, v2: 45, v3: 45 }}
			${"from 2 specified values across 1 unspecified value"}  | ${["v1", "v2", "v3"]}       | ${{ v1: 10, v2: 60 }}  | ${{ v1: 10, v2: 60, v3: 30 }}
			${"from 2 specified values across 2 unspecified values"} | ${["v1", "v2", "v3", "v4"]} | ${{ v1: 10, v2: 60 }}  | ${{ v1: 10, v2: 60, v3: 15, v4: 15 }}
			${"limited to specified versionIds"}                     | ${["v1", "v3"]}             | ${{ v1: 10, v2: 70 }}  | ${{ v1: 10, v3: 90 }}
			${"zero when no share remains"}                          | ${["v1", "v2", "v3"]}       | ${{ v1: 10, v2: 90 }}  | ${{ v1: 10, v2: 90, v3: 0 }}
			${"unchanged when fully specified (adding to 100)"}      | ${["v1", "v2"]}             | ${{ v1: 10, v2: 90 }}  | ${{ v1: 10, v2: 90 }}
			${"unchanged when fully specified (adding to < 100)"}    | ${["v1", "v2"]}             | ${{ v1: 10, v2: 20 }}  | ${{ v1: 10, v2: 20 }}
		`(" $description", ({ versionIds, optionalVersionTraffic, expected }) => {
			const result = assignAndDistributePercentages(
				versionIds,
				new Map(Object.entries(optionalVersionTraffic))
			);

			expect(Object.fromEntries(result)).toMatchObject(expected);
		});
	});

	describe("summariseVersionTraffic", () => {
		test("none unspecified", () => {
			const result = summariseVersionTraffic(
				new Map(
					Object.entries({
						v1: 10,
						v2: 90,
					})
				),
				["v1", "v2"]
			);

			expect(result).toMatchObject({
				subtotal: 100,
				unspecifiedCount: 0,
			});
		});

		test("subtotal above 100", () => {
			const result = summariseVersionTraffic(
				new Map(
					Object.entries({
						v1: 30,
						v2: 90,
					})
				),
				["v1", "v2"]
			);

			expect(result).toMatchObject({
				subtotal: 120,
				unspecifiedCount: 0,
			});
		});

		test("subtotal below 100", () => {
			const result = summariseVersionTraffic(
				new Map(
					Object.entries({
						v1: 10,
						v2: 50,
					})
				),
				["v1", "v2"]
			);

			expect(result).toMatchObject({
				subtotal: 60,
				unspecifiedCount: 0,
			});
		});

		test("counts unspecified", () => {
			const result = summariseVersionTraffic(
				new Map(
					Object.entries({
						v1: 10,
						v2: 50,
					})
				),
				["v1", "v2", "v3", "v4"]
			);

			expect(result).toMatchObject({
				subtotal: 60,
				unspecifiedCount: 2,
			});
		});
	});

	describe("validateTrafficSubtotal", () => {
		test("errors if subtotal above max", () => {
			expect(() =>
				validateTrafficSubtotal(101, { min: 0, max: 100 })
			).toThrowErrorMatchingInlineSnapshot(
				`"Sum of specified percentages (101%) must be at most 100%"`
			);
		});
		test("errors if subtotal below min", () => {
			expect(() =>
				validateTrafficSubtotal(-1, { min: 0, max: 100 })
			).toThrowErrorMatchingInlineSnapshot(
				`"Sum of specified percentages (-1%) must be at least 0%"`
			);
		});
		test("different error message if min === max", () => {
			expect(() =>
				validateTrafficSubtotal(101, { min: 100, max: 100 })
			).toThrowErrorMatchingInlineSnapshot(
				`"Sum of specified percentages (101%) must be 100%"`
			);
		});
		test("no error if subtotal above max but not above max + EPSILON", () => {
			expect(() => validateTrafficSubtotal(100.001)).not.toThrow();

			expect(() =>
				validateTrafficSubtotal(100.01)
			).toThrowErrorMatchingInlineSnapshot(
				`"Sum of specified percentages (100.01%) must be 100%"`
			);
		});
		test("no error if subtotal below min but not below min - EPSILON", () => {
			expect(() => validateTrafficSubtotal(99.999)).not.toThrow();

			expect(() =>
				validateTrafficSubtotal(99.99)
			).toThrowErrorMatchingInlineSnapshot(
				`"Sum of specified percentages (99.99%) must be 100%"`
			);
		});
	});
});
