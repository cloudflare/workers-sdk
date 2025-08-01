import * as path from "node:path";
import { describe, expect, test, vi } from "vitest";
import {
	getTextResponse,
	isBuild,
	mockFileChange,
	serverLogs,
	WAIT_FOR_OPTIONS,
} from "../../__test-utils__";

describe("config-changes", () => {
	test.runIf(!isBuild)(
		"successfully updates when a var is updated in the Worker config",
		async () => {
			await vi.waitFor(
				async () =>
					expect(await getTextResponse()).toContain(
						'The value of MY_VAR is "one"'
					),
				WAIT_FOR_OPTIONS
			);

			mockFileChange(path.join(__dirname, "../wrangler.json"), (content) =>
				JSON.stringify({
					...JSON.parse(content),
					vars: {
						MY_VAR: "two",
					},
				})
			);

			await vi.waitFor(
				async () =>
					expect(await getTextResponse()).toContain(
						'The value of MY_VAR is "two"'
					),
				WAIT_FOR_OPTIONS
			);
		}
	);

	test.runIf(!isBuild)(
		"reports errors in updates to the Worker config",
		async () => {
			await vi.waitFor(
				async () =>
					expect(await getTextResponse()).toContain(
						'The value of MY_VAR is "one"'
					),
				WAIT_FOR_OPTIONS
			);

			mockFileChange(path.join(__dirname, "../wrangler.json"), (content) =>
				JSON.stringify({
					...JSON.parse(content),
					compatibility_date: undefined,
					vars: {
						MY_VAR: "two",
					},
				})
			);

			await vi.waitFor(async () => {
				expect(serverLogs.errors.join()).toMatch(
					/.*No 'compatibility_date' field provided*/
				);
				expect(await getTextResponse()).toContain(
					'The value of MY_VAR is "one"'
				);
			}, WAIT_FOR_OPTIONS);
		}
	);
});
