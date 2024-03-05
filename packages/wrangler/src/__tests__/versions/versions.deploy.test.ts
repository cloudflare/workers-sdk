import yargs from "yargs";
import {
	parseVersionSpecs,
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
});
