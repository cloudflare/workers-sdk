import * as path from "node:path";
import { describe, expect, test } from "vitest";
import { cleanUrl, getOutputDirectory } from "../utils";

describe("cleanUrl", () => {
	test("removes query parameters from URL", () => {
		expect(cleanUrl("./file.wasm?module")).toBe("./file.wasm");
	});

	test("removes hash fragments from URL", () => {
		expect(cleanUrl("./file.js#section")).toBe("./file.js");
	});

	test("preserves subpath imports that start with #", () => {
		expect(cleanUrl("#path/to/file.html")).toBe("#path/to/file.html");
		expect(cleanUrl("#components/template.txt")).toBe(
			"#components/template.txt"
		);
	});

	test("removes query parameters from subpath imports", () => {
		expect(cleanUrl("#path/to/file.html?param=value")).toBe("#path/to/file.html");
		expect(cleanUrl("#components/template.txt?version=1&debug=true")).toBe(
			"#components/template.txt"
		);
	});

	test("removes hash fragments from subpath imports", () => {
		expect(cleanUrl("#path/to/file.html#section")).toBe("#path/to/file.html");
		expect(cleanUrl("#components/template.txt#anchor")).toBe(
			"#components/template.txt"
		);
	});

	test("removes both query and hash from subpath imports", () => {
		expect(cleanUrl("#path/to/file.html?param=value#section")).toBe("#path/to/file.html");
	});

	test("returns unchanged URL when no query or hash present", () => {
		expect(cleanUrl("./file.html")).toBe("./file.html");
		expect(cleanUrl("/absolute/path.txt")).toBe("/absolute/path.txt");
	});
});

describe("getOutputDirectory", () => {
	test("returns the correct output if `environments[environmentName].build.outDir` is defined", () => {
		expect(
			getOutputDirectory(
				{
					environments: {
						worker: {
							build: { outDir: "custom-environment-output-directory" },
						},
					},
				},
				"worker"
			)
		).toBe("custom-environment-output-directory");
	});

	test("returns the correct output if `environments[environmentName].build.outDir` is not defined and `build.outDir` is defined", () => {
		expect(
			getOutputDirectory(
				{ build: { outDir: "custom-root-output-directory" } },
				"environment-name"
			)
		).toBe(path.join("custom-root-output-directory", "environment-name"));
	});

	test("returns the correct output if `environments[environmentName].build.outDir` and `build.outDir` are not defined", () => {
		expect(getOutputDirectory({}, "environment-name")).toBe(
			path.join("dist", "environment-name")
		);
	});
});
