import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { getJsonResponse, isBuild, testDir } from "../../__test-utils__";

test("reading variables from a standard .dev.vars file", async () => {
	expect(await getJsonResponse()).toEqual({
		"variables present in .dev.vars": {
			MY_DEV_VAR_A: "my .dev.vars variable A",
			MY_DEV_VAR_B: "my .dev.vars variable B",
			MY_DEV_VAR_C: "my .dev.vars variable C",
		},
	});
});

describe.runIf(isBuild)("build output files", () => {
	test("the .dev.vars file has been copied over", async () => {
		const srcDevVarsPath = `${testDir}/.dev.vars`;
		const distDevVarsPath = `${testDir}/dist/worker/.dev.vars`;

		const distDevVarsExists = fs.existsSync(distDevVarsPath);
		expect(distDevVarsExists).toBe(true);

		const srcDevVarsContent = fs.readFileSync(srcDevVarsPath, "utf-8");
		const distDevVarsContent = fs.readFileSync(distDevVarsPath, "utf-8");
		expect(distDevVarsContent).toEqual(srcDevVarsContent);
	});

	test("secrets from .dev.vars haven't been inlined in the js output file", async () => {
		const distIndexPath = `${testDir}/dist/worker/index.js`;

		const distIndexContent = fs.readFileSync(distIndexPath, "utf-8");
		expect(distIndexContent).not.toContain("my .dev.vars variable");
	});
});
