import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
/* eslint-disable workers-sdk/no-vitest-import-expect -- expect used inside .forEach() parameterized test generation */
import { assert, describe, expect, test } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { getValidatedWranglerConfigPath } from "../workers-configs";

const fixturesPath = fileURLToPath(new URL("fixtures", import.meta.url));

const isWindows = process.platform === "win32";

describe("valid cases", () => {
	test("should return the value of a found wrangler config", () => {
		const result = getValidatedWranglerConfigPath(fixturesPath, undefined);
		assert(result, "Expected a wrangler config path to be found");
		expect(normalize(result)).toMatch(
			isWindows
				? /\\__tests__\\fixtures\\wrangler\.jsonc/
				: /\/__tests__\/fixtures\/wrangler\.jsonc/
		);
	});

	test("should return the value of a requested wrangler config", () => {
		const result = getValidatedWranglerConfigPath(
			fixturesPath,
			join(fixturesPath, "simple-wrangler.jsonc")
		);
		assert(result, "Expected a wrangler config path to be found");
		expect(normalize(result)).toMatch(
			isWindows
				? /\\__tests__\\fixtures\\simple-wrangler\.jsonc/
				: /\/__tests__\/fixtures\/simple-wrangler\.jsonc/
		);
	});
});

describe("zero-config cases", () => {
	test("should return undefined when no wrangler config is found (zero-config mode)", () => {
		const result = getValidatedWranglerConfigPath(
			join(fixturesPath, "empty-dir"),
			undefined
		);
		expect(result).toBeUndefined();
	});
});

describe("invalid cases", () => {
	[false, true].forEach((forAuxiliaryWorker) => {
		const testPrefix = forAuxiliaryWorker
			? "[auxiliary worker]"
			: "[main worker]";
		test(`${testPrefix} should error if a requested path points to a file without an extension`, () => {
			expect(() => {
				getValidatedWranglerConfigPath(
					fixturesPath,
					join(fixturesPath, "simple-wrangler"),
					forAuxiliaryWorker
				);
			}).toThrowError(
				forAuxiliaryWorker
					? /The provided configPath \(.*?simple-wrangler\) requested for one of your auxiliary workers doesn't point to a file with the correct file extension. It should point to a jsonc, json or toml file \(no extension found instead\)/
					: /The provided configPath \(.*?simple-wrangler\) doesn't point to a file with the correct file extension. It should point to a jsonc, json or toml file \(no extension found instead\)/
			);
		});

		test(`${testPrefix} should error if a requested path points to a file with an incorrect extension`, () => {
			expect(() => {
				getValidatedWranglerConfigPath(
					fixturesPath,
					join(fixturesPath, "simple-wrangler.txt"),
					forAuxiliaryWorker
				);
			}).toThrowError(
				forAuxiliaryWorker
					? /The provided configPath \(.*?simple-wrangler\.txt\) requested for one of your auxiliary workers doesn't point to a file with the correct file extension. It should point to a jsonc, json or toml file \("txt" found instead\)/
					: /The provided configPath \(.*?simple-wrangler\.txt\) doesn't point to a file with the correct file extension. It should point to a jsonc, json or toml file \("txt" found instead\)/
			);
		});

		test(`${testPrefix} should error if a requested path points to a directory`, () => {
			expect(() => {
				getValidatedWranglerConfigPath(
					fixturesPath,
					join(fixturesPath, "empty-dir.jsonc"),
					forAuxiliaryWorker
				);
			}).toThrowError(
				forAuxiliaryWorker
					? /The provided configPath \(.*?empty-dir.jsonc\) requested for one of your auxiliary workers points to a directory\. It should point to a file\./
					: /The provided configPath \(.*?empty-dir.jsonc\) points to a directory\. It should point to a file\./
			);
		});

		test(`${testPrefix} should error if a requested path points to a non-existent file`, () => {
			expect(() => {
				getValidatedWranglerConfigPath(
					fixturesPath,
					join(fixturesPath, "empty-dir/wrangler.jsonc"),
					forAuxiliaryWorker
				);
			}).toThrowError(
				forAuxiliaryWorker
					? /The provided configPath \(.*?wrangler.jsonc\) requested for one of your auxiliary workers doesn't point to an existing file/
					: /The provided configPath \(.*?wrangler.jsonc\) doesn't point to an existing file/
			);
		});
	});
});
