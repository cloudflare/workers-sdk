import * as path from "node:path";
import { expect, test, vi } from "vitest";
import { getJsonResponse, isBuild, mockFileChange } from "../../__test-utils__";

test.runIf(!isBuild)(
	"successfully updates when a var is updated in a .env file",
	async () => {
		const originalResponseContent = {
			"variables loaded from .env": {
				MY_DEV_VAR_A: "my .env variable A",
				MY_DEV_VAR_B: "my .env variable B",
				MY_DEV_VAR_C: "my .env variable C", // Note that unlike .dev.vars, we merge .env files
			},
		};
		const originalResponse = await getJsonResponse();
		expect(originalResponse).toMatchObject(originalResponseContent);

		mockFileChange(path.join(__dirname, "../.env"), (content) =>
			content.replace(/my \.env/g, "my .env UPDATED")
		);

		await vi.waitFor(
			async () => {
				const updatedResponse = await getJsonResponse();
				expect(updatedResponse).toEqual({
					"variables loaded from .env": {
						MY_DEV_VAR_A: "my .env UPDATED variable A",
						MY_DEV_VAR_B: "my .env UPDATED variable B",
						MY_DEV_VAR_C: "my .env UPDATED variable C", // Note that unlike .dev.vars, we merge .env files
					},
				});
			},
			{ timeout: 5000 }
		);
	}
);
