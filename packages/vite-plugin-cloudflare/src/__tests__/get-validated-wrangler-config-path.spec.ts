import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { getValidatedWranglerConfigPath } from "../workers-configs";

const fixturesPath = fileURLToPath(new URL("fixtures", import.meta.url));

const isWindows = process.platform === "win32";

describe("getValidatedWranglerConfigPath", () => {
	describe("valid cases", () => {
		test("should return the value of a found wrangler config", () => {
			const path = getValidatedWranglerConfigPath(fixturesPath);
			expect(normalize(path)).toMatch(
				isWindows
					? /\\__tests__\\fixtures\\wrangler\.toml/
					: /\/__tests__\/fixtures\/wrangler\.toml/
			);
		});

		test("should return the value of a requested wrangler config", () => {
			const path = getValidatedWranglerConfigPath(
				fixturesPath,
				join(fixturesPath, "simple-wrangler.toml")
			);
			expect(normalize(path)).toMatch(
				isWindows
					? /\\__tests__\\fixtures\\simple-wrangler\.toml/
					: /\/__tests__\/fixtures\/simple-wrangler\.toml/
			);
		});
	});

	describe("invalid cases", () => {
		test("should error with an helpful message if a wrangler config could not be found", () => {
			expect(() => {
				getValidatedWranglerConfigPath(join(fixturesPath, "empty-dir"));
			}).toThrowError(
				/No config file found in the .*?empty-dir directory, please add an appropriate wrangler.\(jsonc\|json\|toml\) file to the directory/
			);
		});

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
						? /The provided configPath \(.*?simple-wrangler\.txt\) requested for one of your auxiliary workers doesn't point to a file with the correct file extension. It should point to a jsonc, json or toml file \(\"txt\" found instead\)/
						: /The provided configPath \(.*?simple-wrangler\.txt\) doesn't point to a file with the correct file extension. It should point to a jsonc, json or toml file \(\"txt\" found instead\)/
				);
			});

			test(`${testPrefix} should error if a requested path points to a directory`, () => {
				expect(() => {
					getValidatedWranglerConfigPath(
						fixturesPath,
						join(fixturesPath, "empty-dir.toml"),
						forAuxiliaryWorker
					);
				}).toThrowError(
					forAuxiliaryWorker
						? /The provided configPath \(.*?empty-dir.toml\) requested for one of your auxiliary workers points to a directory, it needs to point to a file instead/
						: /The provided configPath \(.*?empty-dir.toml\) points to a directory, it needs to point to a file instead/
				);
			});

			test(`${testPrefix} should error if a requested path points to a non-existent file`, () => {
				expect(() => {
					getValidatedWranglerConfigPath(
						fixturesPath,
						join(fixturesPath, "empty-dir/wrangler.toml"),
						forAuxiliaryWorker
					);
				}).toThrowError(
					forAuxiliaryWorker
						? /The provided configPath \(.*?wrangler.toml\) requested for one of your auxiliary workers doesn't point to an existing file/
						: /The provided configPath \(.*?wrangler.toml\) doesn't point to an existing file/
				);
			});
		});
	});
});
