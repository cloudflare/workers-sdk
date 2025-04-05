import * as fs from "node:fs";
import * as path from "node:path";
import { expect, test, vi } from "vitest";
import { getJsonResponse, isBuild } from "../../../__test-utils__";

test.runIf(!isBuild)(
	"successfully updates when a var is updated in a .dev.vars.staging file",
	async ({ onTestFinished }) => {
		const dotDevDotVarsFilePath = path.join(
			__dirname,
			"../../.dev.vars.staging"
		);
		const originalDotDevDotVars = fs.readFileSync(
			dotDevDotVarsFilePath,
			"utf-8"
		);

		onTestFinished(async () => {
			fs.writeFileSync(dotDevDotVarsFilePath, originalDotDevDotVars);
			// We need to ensure that the original config is restored before the next test runs
			await vi.waitFor(
				async () => {
					expect(await getJsonResponse()).toEqual({
						"variables present in .dev.vars.staging": {
							MY_DEV_VAR_A: "my .dev.vars staging variable A",
							MY_DEV_VAR_B: "my .dev.vars staging variable B",
						},
					});
				},
				{ timeout: 5000 }
			);
		});

		const originalResponse = await getJsonResponse();
		expect(originalResponse).toEqual({
			"variables present in .dev.vars.staging": {
				MY_DEV_VAR_A: "my .dev.vars staging variable A",
				MY_DEV_VAR_B: "my .dev.vars staging variable B",
			},
		});

		const updatedDotDevDotVars = originalDotDevDotVars.replace(
			/my \.dev\.vars staging variable/g,
			"my .dev.vars UPDATED staging variable"
		);

		fs.writeFileSync(dotDevDotVarsFilePath, updatedDotDevDotVars);
		await vi.waitFor(
			async () => {
				const updatedResponse = await getJsonResponse();
				expect(updatedResponse).toEqual({
					"variables present in .dev.vars.staging": {
						MY_DEV_VAR_A: "my .dev.vars UPDATED staging variable A",
						MY_DEV_VAR_B: "my .dev.vars UPDATED staging variable B",
					},
				});
			},
			{ timeout: 5000 }
		);
	}
);
