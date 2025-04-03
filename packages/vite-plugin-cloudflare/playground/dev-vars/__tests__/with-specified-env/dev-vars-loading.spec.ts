import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { getJsonResponse, isBuild, testDir } from "../../../__test-utils__";

test("reading variables from a staging .dev.vars file", async () => {
	expect(await getJsonResponse()).toEqual({
		"variables present in .dev.vars.staging": {
			MY_DEV_VAR_A: "my .dev.vars staging variable A",
			MY_DEV_VAR_B: "my .dev.vars staging variable B",
		},
	});
});

describe.runIf(isBuild)("build output files", () => {
	test("the .dev.vars.staging file has been copied over as .dev.vars", async () => {
		const srcDevVarsStagingPath = `${testDir}/.dev.vars.staging`;
		const distDevVarsPath = `${testDir}/dist/worker/.dev.vars`;
		const distDevVarsStagingPath = `${distDevVarsPath}.staging`;

		const distDevVarsExists = fs.existsSync(distDevVarsPath);
		expect(distDevVarsExists).toBe(true);

		const srcDevVarsStagingContent = fs.readFileSync(
			srcDevVarsStagingPath,
			"utf-8"
		);
		const distDevVarsContent = fs.readFileSync(distDevVarsPath, "utf-8");
		expect(distDevVarsContent).toEqual(srcDevVarsStagingContent);

		const distDevVarsStagingExists = fs.existsSync(distDevVarsStagingPath);
		expect(distDevVarsStagingExists).toBe(false);
	});
});
