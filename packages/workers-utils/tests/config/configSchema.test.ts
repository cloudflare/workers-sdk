import fs from "node:fs";
import path from "node:path";
// eslint-disable-next-line workers-sdk/no-vitest-import-expect -- see #12346
import { describe, expect, test } from "vitest";

describe("src/config/environment.ts", () => {
	// `@default` values must not be escaped in order to generate a valid schema.
	test("default values are not escaped", () => {
		const srcFile = path.join(__dirname, "../../src/config/environment.ts");
		const srcLines = fs.readFileSync(srcFile, "utf-8").split("\n");
		const hasEscapedDefaultRegex = /@default\s+`/;
		srcLines.forEach((line, lineNumber) => {
			const hasEscapedDefault = hasEscapedDefaultRegex.test(line);
			expect
				.soft(hasEscapedDefault, `On line ${lineNumber + 1}: "${line}"`)
				.toEqual(false);
		});
	});
});
