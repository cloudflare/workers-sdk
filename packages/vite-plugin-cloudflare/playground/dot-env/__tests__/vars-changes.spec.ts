import * as path from "node:path";
import { test, vi } from "vitest";
import {
	getJsonResponse,
	isBuild,
	mockFileChange,
	WAIT_FOR_OPTIONS,
} from "../../__test-utils__";

test.runIf(!isBuild)(
	"successfully updates when a var is updated in a .env file",
	async ({ expect }) => {
		await vi.waitFor(
			async () =>
				expect(await getJsonResponse()).toEqual({
					"variables loaded from .env": {
						MY_DEV_VAR_A: "my .env variable A",
						MY_DEV_VAR_B: "my .env variable B",
						MY_DEV_VAR_C: "my .env variable C",
					},
				}),
			WAIT_FOR_OPTIONS
		);

		mockFileChange(path.join(__dirname, "../.env"), (content) =>
			content.replace(/my \.env/g, "my .env UPDATED")
		);

		await vi.waitFor(
			async () =>
				expect(await getJsonResponse()).toEqual({
					"variables loaded from .env": {
						MY_DEV_VAR_A: "my .env UPDATED variable A",
						MY_DEV_VAR_B: "my .env UPDATED variable B",
						MY_DEV_VAR_C: "my .env UPDATED variable C", // Note that unlike .dev.vars, we merge .env files
					},
				}),
			WAIT_FOR_OPTIONS
		);
	}
);
