import * as path from "node:path";
import { expect, test, vi } from "vitest";
import {
	getJsonResponse,
	isBuild,
	mockFileChange,
	WAIT_FOR_OPTIONS,
} from "../../../__test-utils__";

test.runIf(!isBuild)(
	"successfully updates when a var is updated in a .env.staging file",
	async () => {
		const originalResponseContent = {
			"variables loaded from .env and .env.staging": {
				MY_DEV_VAR_A: "my .env staging variable A",
				MY_DEV_VAR_B: "my .env staging variable B",
				MY_DEV_VAR_C: "my .env variable C", // Note that unlike .dev.vars, we merge .env files
			},
		};
		const originalResponse = await getJsonResponse();
		expect(originalResponse).toEqual(originalResponseContent);

		mockFileChange(path.join(__dirname, "../../.env.staging"), (content) =>
			content.replace(/my \.env staging/g, "my .env UPDATED staging")
		);

		await vi.waitFor(async () => {
			const updatedResponse = await getJsonResponse();
			expect(updatedResponse).toEqual({
				"variables loaded from .env and .env.staging": {
					MY_DEV_VAR_A: "my .env UPDATED staging variable A",
					MY_DEV_VAR_B: "my .env UPDATED staging variable B",
					MY_DEV_VAR_C: "my .env variable C", // Note that unlike .dev.vars, we merge .env files
				},
			});
		}, WAIT_FOR_OPTIONS);
	}
);
