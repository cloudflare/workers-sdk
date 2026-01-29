import { describe, expect, it } from "vitest";
import {
	displayPath,
	indexLocation,
	parseByteSize,
	parseJSON,
	parseJSONC,
	parseTOML,
	searchLocation,
} from "../src/parse";

describe("parseTOML", () => {
	it("should parse toml that is empty", () => {
		expect(parseTOML("")).toStrictEqual({});
	});

	it("should parse toml with basic values", () => {
		expect(
			parseTOML(`
        name = "basic"
        version = 1
    `)
		).toStrictEqual({
			name: "basic",
			version: 1,
		});
	});

	it("should parse toml with complex values", () => {
		expect(
			parseTOML(`
        name = 'complex'
        version = 1
        [owner]
        name = ["tim"]
        alive = true
        [owner.dog]
        exists = true
      `)
		).toStrictEqual({
			name: "complex",
			owner: {
				alive: true,
				dog: {
					exists: true,
				},
				name: ["tim"],
			},
			version: 1,
		});
	});

	it("should fail to parse toml with invalid string", () => {
		try {
			parseTOML(`name = 'fail"`);
			expect.fail("parseTOML did not throw");
		} catch (err) {
			expect({ ...(err as Error) }).toStrictEqual({
				name: "ParseError",
				text: "Invalid TOML document: only letter, numbers, dashes and underscores are allowed in keys",
				kind: "error",
				location: {
					line: 1,
					column: 12,
					fileText: "name = 'fail\"",
					file: undefined,
					lineText: "name = 'fail\"",
				},
				notes: [],
				telemetryMessage: "TOML parse error",
			});
		}
	});

	it("should fail to parse toml with invalid header", () => {
		try {
			parseTOML(`\n[name`, "config.toml");
			expect.fail("parseTOML did not throw");
		} catch (err) {
			expect({ ...(err as Error) }).toStrictEqual({
				name: "ParseError",
				text: "Invalid TOML document: incomplete key-value: cannot find end of key",
				kind: "error",
				location: {
					line: 2,
					column: 1,
					file: "config.toml",
					fileText: "\n[name",
					lineText: "[name",
				},
				notes: [],
				telemetryMessage: "TOML parse error",
			});
		}
	});

	it("should cope with Windows line-endings", () => {
		expect(
			parseTOML(
				"# A comment with a Windows line-ending\r\n# Another comment with a Windows line-ending\r\n"
			)
		).toEqual({});
	});
});

describe("parseJSON", () => {
	it("should parse json that is empty", () => {
		expect(parseJSON("{}")).toStrictEqual({});
	});

	it("should parse json with basic values", () => {
		expect(
			parseJSON(`
      {
        "name" : "basic",
        "version": 1
      }`)
		).toStrictEqual({
			name: "basic",
			version: 1,
		});
	});

	it("should parse json with complex values", () => {
		expect(
			parseJSON(
				`{
          "name":"complex",
          "spec":{
            "uptime":[1,2.5,3],
            "ok":true
          }
        }`
			)
		).toStrictEqual({
			name: "complex",
			spec: {
				uptime: [1, 2.5, 3],
				ok: true,
			},
		});
	});

	it("should fail to parse json with invalid string", () => {
		try {
			parseJSON(`\n{\n"version" "1\n}\n`);
			expect.fail("parseJSON did not throw");
		} catch (err) {
			const { text, ...serialised } = err as Record<string, unknown>;
			expect(serialised).toStrictEqual({
				name: "ParseError",
				kind: "error",
				location: {
					line: 3,
					column: 10,
					length: 2,
					lineText: '"version" "1',
					file: undefined,
					fileText: `\n{\n"version" "1\n}\n`,
				},
				notes: [],
				telemetryMessage: "JSON(C) parse error",
			});
			expect(text).toEqual("UnexpectedEndOfString");
		}
	});

	it("should fail to parse json with invalid number", () => {
		const file = "config.json",
			fileText = `{\n\t"a":{\n\t\t"b":{\n\t\t\t"c":[012345]\n}\n}\n}`;
		try {
			parseJSON(fileText, file);
			expect.fail("parseJSON did not throw");
		} catch (err) {
			expect({ ...(err as Error) }).toStrictEqual({
				name: "ParseError",
				text: "CommaExpected",
				kind: "error",
				location: {
					file,
					fileText,
					line: 4,
					column: 9,
					length: 5,
					lineText: `\t\t\t"c":[012345]`,
				},
				notes: [],
				telemetryMessage: "JSON(C) parse error",
			});
		}
	});
});
describe("parseJSONC", () => {
	it("should parse jsonc that is empty", () => {
		expect(parseJSONC("{}")).toStrictEqual({});
	});

	it("should parse jsonc with basic values", () => {
		expect(
			parseJSONC(`
      {
        "name" : "basic",
        "version": 1
      }`)
		).toStrictEqual({
			name: "basic",
			version: 1,
		});
	});

	it("should parse jsonc with complex values", () => {
		expect(
			parseJSONC(
				`{
          "name":"complex",
          "spec":{
            "uptime":[1,2.5,3],
            "ok":true
          }
        }`
			)
		).toStrictEqual({
			name: "complex",
			spec: {
				uptime: [1, 2.5, 3],
				ok: true,
			},
		});
	});

	it("should parse jsonc with comments", () => {
		expect(
			parseJSONC(
				`{
					// Comment A
          "name":"complex",
          "spec":{
						// Nested comment
            "uptime":[1,2.5,3],
            "ok":true
          }
        }`
			)
		).toStrictEqual({
			name: "complex",
			spec: {
				uptime: [1, 2.5, 3],
				ok: true,
			},
		});
	});

	it("should fail to parse jsonc with invalid string", () => {
		try {
			parseJSONC(`\n{\n"version" "1\n}\n`);
			expect.fail("parseJSONC did not throw");
		} catch (err) {
			expect({ ...(err as Error) }).toStrictEqual({
				name: "ParseError",
				text: "UnexpectedEndOfString",
				kind: "error",
				location: {
					length: 2,
					line: 3,
					column: 10,
					lineText: '"version" "1',
					file: undefined,
					fileText: `\n{\n"version" "1\n}\n`,
				},
				notes: [],
				telemetryMessage: "JSON(C) parse error",
			});
		}
	});

	it("should fail to parse jsonc with invalid number", () => {
		const file = "config.json",
			fileText = `{\n\t"a":{\n\t\t"b":{\n\t\t\t"c":[012345]\n}\n}\n}`;
		try {
			parseJSONC(fileText, file);
			expect.fail("parseJSONC did not throw");
		} catch (err) {
			expect({ ...(err as Error) }).toStrictEqual({
				name: "ParseError",
				text: "CommaExpected",
				kind: "error",
				location: {
					file,
					fileText,
					length: 5,
					line: 4,
					column: 9,
					lineText: `\t\t\t"c":[012345]`,
				},
				notes: [],
				telemetryMessage: "JSON(C) parse error",
			});
		}
	});
});
describe("indexLocation", () => {
	it("should calculate location from one-line input", () => {
		const fileText = "";
		expect(indexLocation({ fileText }, 1)).toStrictEqual({
			fileText,
			line: 1,
			column: 0,
			lineText: "",
		});
	});

	it("should calculate location from multi-line input", () => {
		const file = "package.json",
			fileText = `\n{\n\t"hello":"world"\n}\n`;
		expect(indexLocation({ file, fileText }, 11)).toStrictEqual({
			file,
			fileText,
			line: 3,
			column: 7,
			lineText: `\t"hello":"world"`,
		});
	});

	it("should calculate location when index is out of bounds", () => {
		const fileText = `\n\n\n\n`;
		expect(indexLocation({ fileText }, 10)).toStrictEqual({
			fileText,
			line: 5,
			column: 0,
			lineText: undefined,
		});
	});
});

describe("searchLocation", () => {
	it("should calculate location from one-line match", () => {
		const file = "config.toml",
			fileText = `name = 'coolthing'`;
		expect(searchLocation({ file, fileText }, "coolthing")).toStrictEqual({
			file,
			fileText,
			line: 1,
			column: 8,
			length: 9,
			lineText: `name = 'coolthing'`,
		});
	});

	it("should calculate location from multi-line match", () => {
		const fileText = `\n{"versions":[\n\t"1.2.3",\n\t"1.2.4",\n\t"1.2.5"\n]}\n`;
		expect(searchLocation({ fileText }, "1.2.4")).toStrictEqual({
			fileText,
			line: 4,
			column: 2,
			length: 5,
			lineText: `\t"1.2.4",`,
		});
	});

	it("should calculate location from no match", () => {
		const fileText = `\n{}\n`;
		expect(searchLocation({ fileText }, "apple")).toStrictEqual({
			fileText,
			line: 3,
			column: 0,
			length: undefined,
			lineText: undefined,
		});
	});
});

describe("parseByteSize", () => {
	it("should calculate valid byte sizes", () => {
		const cases: [string, number][] = [
			["3", 3],
			["3B", 3],
			["3b", 3],
			["1.3Kb", 1300],
			["1.3kib", 1331],
			["42MB", 42_000_000],
			["42mib", 44_040_192],
			["0.8MB", 800_000],
			["0.8MiB", 838_860],
			["2 GB", 2_000_000_000],
			["2 giB", 2_147_483_648],

			// If the b/ib suffix is omitted, assume non-binary units
			["2G", 2_000_000_000],
			["2T", 2_000_000_000_000],
			["2P", 2_000_000_000_000_000],
		];

		for (const [input, result] of cases) {
			expect(parseByteSize(input)).toEqual(result);
		}
	});

	it("should return NaN for invalid input", () => {
		expect(parseByteSize("")).toBeNaN();
		expect(parseByteSize("foo")).toBeNaN();
		expect(parseByteSize("B")).toBeNaN();
		expect(parseByteSize("iB")).toBeNaN();
		expect(parseByteSize(".B")).toBeNaN();
		expect(parseByteSize("3iB")).toBeNaN();
		expect(parseByteSize("3ib")).toBeNaN();
	});
});

describe("displayPath", () => {
	it("should convert Windows backslashes to forward slashes", () => {
		expect(displayPath("C:\\Users\\thepl\\project\\wrangler.json")).toBe(
			"C:/Users/thepl/project/wrangler.json"
		);
	});

	it("should handle paths with escape sequence characters", () => {
		// These paths contain characters that would form escape sequences
		// \t = tab, \n = newline, \r = carriage return
		expect(displayPath("C:\\Users\\thepl\\temp\\file.txt")).toBe(
			"C:/Users/thepl/temp/file.txt"
		);
		expect(displayPath("C:\\Users\\neil\\project")).toBe(
			"C:/Users/neil/project"
		);
		expect(displayPath("C:\\Users\\robin\\folder")).toBe(
			"C:/Users/robin/folder"
		);
	});

	it("should leave Unix paths unchanged", () => {
		expect(displayPath("/home/user/project/wrangler.json")).toBe(
			"/home/user/project/wrangler.json"
		);
	});

	it("should handle relative paths", () => {
		expect(displayPath("src\\index.ts")).toBe("src/index.ts");
		expect(displayPath("./src/index.ts")).toBe("./src/index.ts");
	});

	it("should handle empty strings", () => {
		expect(displayPath("")).toBe("");
	});
});
