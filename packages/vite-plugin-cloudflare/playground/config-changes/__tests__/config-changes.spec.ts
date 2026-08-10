import * as path from "node:path";
import { describe, test, vi } from "vitest";
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
		async ({ expect }) => {
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
		async ({ expect }) => {
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
					main: "./src/non-existing-file.ts",
					vars: {
						MY_VAR: "two",
					},
				})
			);

			await vi.waitFor(async () => {
				expect(serverLogs.errors.join()).toMatch(
					/.*The provided Wrangler config main field .+? doesn't point to an existing file.*/
				);
				expect(await getTextResponse()).toContain(
					'The value of MY_VAR is "one"'
				);
			}, WAIT_FOR_OPTIONS);
		}
	);

	test.runIf(!isBuild)(
		"applies further Worker config changes after a broken config update",
		async ({ expect }) => {
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
					main: "./src/missing-after-broken-update.ts",
				})
			);

			await vi.waitFor(
				() =>
					expect(serverLogs.errors.join()).toContain(
						"missing-after-broken-update"
					),
				WAIT_FOR_OPTIONS
			);

			// The restart triggered by the broken config fails and keeps the
			// current server running. A subsequent config change must still be
			// picked up.
			mockFileChange(path.join(__dirname, "../wrangler.json"), (content) =>
				JSON.stringify({
					...JSON.parse(content),
					main: "./src/index.ts",
					vars: {
						MY_VAR: "three",
					},
				})
			);

			await vi.waitFor(
				async () =>
					expect(await getTextResponse()).toContain(
						'The value of MY_VAR is "three"'
					),
				WAIT_FOR_OPTIONS
			);
		}
	);
});
