import * as path from "node:path";
import { test, vi } from "vitest";
import {
	getJsonResponse,
	isBuild,
	mockFileChange,
	WAIT_FOR_OPTIONS,
} from "../../../__test-utils__";

test.runIf(!isBuild)(
	"reloads Worker secrets when .dev.vars.staging changes",
	async ({ expect }) => {
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

		mockFileChange(path.join(__dirname, "../../.dev.vars.staging"), (content) =>
			content.replace(
				/my \.dev\.vars staging variable/g,
				"my .dev.vars UPDATED staging variable"
			)
		);

		await vi.waitFor(async () => {
			const updatedResponse = await getJsonResponse();
			expect(updatedResponse).toEqual({
				"variables present in .dev.vars.staging": {
					MY_DEV_VAR_A: "my .dev.vars UPDATED staging variable A",
					MY_DEV_VAR_B: "my .dev.vars UPDATED staging variable B",
				},
			});
		}, WAIT_FOR_OPTIONS);
	}
);
