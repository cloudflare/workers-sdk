import fs from "node:fs";
import { describe, test } from "vitest";
import { getJsonResponse, isBuild, testDir } from "../../__test-utils__";

const expectedVars = {
	MY_DEV_VAR_A: "my .env variable A",
	MY_DEV_VAR_B: "my .env variable B",
	MY_DEV_VAR_C: "my .env variable C",
};

test("reading variables from a standard .env file", async ({ expect }) => {
	expect(await getJsonResponse()).toEqual({
		"variables loaded from .env": expectedVars,
	});
});

describe.runIf(isBuild)("build output files", () => {
	test("the .dev.vars file has been created in the build directory", async ({
		expect,
	}) => {
		const distDevVarsPath = `${testDir}/dist/worker/.dev.vars`;
		const distDevVarsExists = fs.existsSync(distDevVarsPath);
		expect(distDevVarsExists).toBe(true);

		const distDevVarsContent = fs.readFileSync(distDevVarsPath, "utf-8");
		expect(distDevVarsContent).toMatchInlineSnapshot(`
			"ENV_NAME = ""
			MY_DEV_VAR_A = "my .env variable A"
			MY_DEV_VAR_B = "my .env variable B"
			MY_DEV_VAR_C = "my .env variable C"
			"
		`);
	});

	test("secrets from .env haven't been inlined in the js output file", async ({
		expect,
	}) => {
		const distIndexPath = `${testDir}/dist/worker/index.js`;

		const distIndexContent = fs.readFileSync(distIndexPath, "utf-8");
		expect(distIndexContent).not.toContain("my .env variable");
	});
});
