import fs from "node:fs";
import { describe, test } from "vitest";
import { getJsonResponse, isBuild, testDir } from "../../../__test-utils__";

test("reading variables from a staging .env file", async ({ expect }) => {
	expect(await getJsonResponse()).toEqual({
		"variables loaded from .env and .env.staging": {
			MY_DEV_VAR_A: "my .env staging variable A",
			MY_DEV_VAR_B: "my .env staging variable B",
			MY_DEV_VAR_C: "my .env variable C", // Note that unlike .dev.vars, we merge .env files
		},
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
			"ENV_NAME = "staging"
			MY_DEV_VAR_A = "my .env staging variable A"
			MY_DEV_VAR_B = "my .env staging variable B"
			MY_DEV_VAR_C = "my .env variable C"
			"
		`);
	});

	test("secrets from .env haven't been inlined in the js output file", async ({
		expect,
	}) => {
		const distIndexPath = `${testDir}/dist/worker/index.js`;

		const distIndexContent = fs.readFileSync(distIndexPath, "utf-8");
		expect(distIndexContent).not.toContain("my .env");
	});
});
