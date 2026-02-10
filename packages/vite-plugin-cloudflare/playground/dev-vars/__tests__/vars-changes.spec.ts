import * as path from "node:path";
import { test, vi } from "vitest";
import {
	getJsonResponse,
	isBuild,
	mockFileChange,
	WAIT_FOR_OPTIONS,
} from "../../__test-utils__";

test.runIf(!isBuild)(
	"successfully updates when a var is updated in a .dev.vars file",
	async ({ expect }) => {
		await vi.waitFor(
			async () =>
				expect(await getJsonResponse()).toEqual({
					"variables present in .dev.vars": {
						MY_DEV_VAR_A: "my .dev.vars variable A",
						MY_DEV_VAR_B: "my .dev.vars variable B",
						MY_DEV_VAR_C: "my .dev.vars variable C",
					},
				}),
			WAIT_FOR_OPTIONS
		);

		mockFileChange(path.join(__dirname, "../.dev.vars"), (content) =>
			content.replace(
				/my \.dev\.vars variable/g,
				"my .dev.vars UPDATED variable"
			)
		);

		await vi.waitFor(async () => {
			const updatedResponse = await getJsonResponse();
			expect(updatedResponse).toEqual({
				"variables present in .dev.vars": {
					MY_DEV_VAR_A: "my .dev.vars UPDATED variable A",
					MY_DEV_VAR_B: "my .dev.vars UPDATED variable B",
					MY_DEV_VAR_C: "my .dev.vars UPDATED variable C",
				},
			});
		}, WAIT_FOR_OPTIONS);
	}
);
