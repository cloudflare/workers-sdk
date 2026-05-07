import fs from "node:fs";
import { describe, test, vi } from "vitest";
import {
	getJsonResponse,
	isBuild,
	testDir,
	WAIT_FOR_OPTIONS,
} from "../../../__test-utils__";

test("reading variables from a staging .dev.vars file", async ({ expect }) => {
	await vi.waitFor(
		async () =>
			expect(await getJsonResponse()).toEqual({
				"variables present in .dev.vars.staging": {
					MY_DEV_VAR_A: "my .dev.vars staging variable A",
					MY_DEV_VAR_B: "my .dev.vars staging variable B",
				},
			}),
		WAIT_FOR_OPTIONS
	);
});

describe.runIf(isBuild)("build output files", () => {
	test("the .dev.vars.staging file has been re-emitted as .dev.vars with values preserved", async ({
		expect,
	}) => {
		const distDevVarsPath = `${testDir}/dist/worker/.dev.vars`;
		const distDevVarsStagingPath = `${distDevVarsPath}.staging`;

		const distDevVarsExists = fs.existsSync(distDevVarsPath);
		expect(distDevVarsExists).toBe(true);

		const distDevVarsContent = fs.readFileSync(distDevVarsPath, "utf-8");
		expect(distDevVarsContent).toMatchInlineSnapshot(`
			"ENV_NAME='staging'
			MY_DEV_VAR_A='my .dev.vars staging variable A'
			MY_DEV_VAR_B='my .dev.vars staging variable B'
			"
		`);

		const distDevVarsStagingExists = fs.existsSync(distDevVarsStagingPath);
		expect(distDevVarsStagingExists).toBe(false);
	});
});
