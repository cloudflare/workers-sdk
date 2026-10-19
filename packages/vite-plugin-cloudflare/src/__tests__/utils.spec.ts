import * as path from "node:path";
import { describe, test } from "vitest";
import { getOutputDirectory } from "../utils";

describe("getOutputDirectory", () => {
	test("returns the correct output if `environments[environmentName].build.outDir` is defined", ({
		expect,
	}) => {
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

	test("returns the correct output if `environments[environmentName].build.outDir` is not defined and `build.outDir` is defined", ({
		expect,
	}) => {
		expect(
			getOutputDirectory(
				{ build: { outDir: "custom-root-output-directory" } },
				"environment-name"
			)
		).toBe(path.join("custom-root-output-directory", "environment-name"));
	});

	test("returns the correct output if `environments[environmentName].build.outDir` and `build.outDir` are not defined", ({
		expect,
	}) => {
		expect(getOutputDirectory({}, "environment-name")).toBe(
			path.join("dist", "environment-name")
		);
	});
});
