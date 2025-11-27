import * as path from "node:path";
import { describe, expect, test } from "vitest";
import { getOutputDirectory, satisfiesMinVersion } from "../utils";

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

test("satisfiesMinVersion", () => {
	// Greater versions
	expect(satisfiesMinVersion("7.0.0", "6.0.0")).toBe(true);
	expect(satisfiesMinVersion("7.2.0", "7.1.0")).toBe(true);
	expect(satisfiesMinVersion("7.1.5", "7.1.3")).toBe(true);
	// Equal versions
	expect(satisfiesMinVersion("7.1.0", "7.1.0")).toBe(true);
	// Lesser versions
	expect(satisfiesMinVersion("4.0.0", "7.0.0")).toBe(false);
	expect(satisfiesMinVersion("7.0.0", "7.1.0")).toBe(false);
	expect(satisfiesMinVersion("7.1.2", "7.1.3")).toBe(false);
	// Invalid versions
	expect(satisfiesMinVersion("7", "7.0.0")).toBe(false);
	expect(satisfiesMinVersion("7.1", "7.0.0")).toBe(false);
	expect(satisfiesMinVersion("7.1.0", "7.0")).toBe(false);
	expect(satisfiesMinVersion("^7.1.0", "7.0.0")).toBe(false);
	expect(satisfiesMinVersion("7.1.0", "6.0.0 - 7.0.0")).toBe(false);
	expect(satisfiesMinVersion("7.1.0-beta.1", "7.0.0")).toBe(false);
});
