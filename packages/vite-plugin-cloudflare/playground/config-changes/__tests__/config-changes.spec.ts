import * as path from "node:path";
import { describe, test, vi } from "vitest";
import {
	getTextResponse,
	isBuild,
	mockFileChange,
	serverLogs,
	viteServer,
	WAIT_FOR_OPTIONS,
} from "../../__test-utils__";

// Ensure Vite has reattached its watcher before `mockFileChange()` restores the
// config at the end of the test.
function trackNextRestart() {
	if (!("restart" in viteServer)) {
		throw new Error("Expected a Vite dev server");
	}

	const restart = vi.spyOn(viteServer, "restart");
	return () =>
		vi.waitFor(() => {
			if (restart.mock.settledResults.length === 0) {
				throw new Error("Vite server restart has not settled");
			}
		}, WAIT_FOR_OPTIONS);
}

describe("config-changes", () => {
	test.runIf(!isBuild)(
		"successfully updates when a var is updated in the Worker config",
		async ({ expect }) => {
			const waitForRestart = trackNextRestart();

			await vi.waitFor(
				async () =>
					expect(await getTextResponse()).toContain(
						'The value of MY_VAR is "one"'
					),
				WAIT_FOR_OPTIONS
			);

			mockFileChange(
				path.join(__dirname, "../cloudflare.config.ts"),
				(content) =>
					content.replace('bindings.text("one")', 'bindings.text("two")')
			);

			await vi.waitFor(
				async () =>
					expect(await getTextResponse()).toContain(
						'The value of MY_VAR is "two"'
					),
				WAIT_FOR_OPTIONS
			);

			await waitForRestart();
		}
	);

	test.runIf(!isBuild)(
		"reports errors in updates to the Worker config",
		async ({ expect }) => {
			const waitForRestart = trackNextRestart();

			await vi.waitFor(
				async () =>
					expect(await getTextResponse()).toContain(
						'The value of MY_VAR is "one"'
					),
				WAIT_FOR_OPTIONS
			);

			mockFileChange(
				path.join(__dirname, "../cloudflare.config.ts"),
				(content) =>
					content
						.replace("./src/index.ts", "./src/non-existing-file.ts")
						.replace('bindings.text("one")', 'bindings.text("two")')
			);

			await vi.waitFor(async () => {
				expect(serverLogs.errors.join()).toMatch(
					/Failed to resolve Worker entrypoint ".+non-existing-file\.ts" for environment "ssr"/
				);
			}, WAIT_FOR_OPTIONS);

			await waitForRestart();
		}
	);

	test.runIf(!isBuild)(
		"applies further Worker config changes after a broken config update",
		async ({ expect }) => {
			const waitForBrokenConfigRestart = trackNextRestart();

			await vi.waitFor(
				async () =>
					expect(await getTextResponse()).toContain(
						'The value of MY_VAR is "one"'
					),
				WAIT_FOR_OPTIONS
			);

			mockFileChange(
				path.join(__dirname, "../cloudflare.config.ts"),
				(content) =>
					content.replace(
						"./src/index.ts",
						"./src/missing-after-broken-update.ts"
					)
			);

			await vi.waitFor(
				() =>
					expect(serverLogs.errors.join()).toContain(
						"missing-after-broken-update"
					),
				WAIT_FOR_OPTIONS
			);

			await waitForBrokenConfigRestart();
			const waitForValidConfigRestart = trackNextRestart();

			// The restart triggered by the broken config fails and keeps the
			// current server running. A subsequent config change must still be
			// picked up.
			mockFileChange(
				path.join(__dirname, "../cloudflare.config.ts"),
				(content) =>
					content
						.replace("./src/missing-after-broken-update.ts", "./src/index.ts")
						.replace('bindings.text("one")', 'bindings.text("three")')
			);

			await vi.waitFor(
				async () =>
					expect(await getTextResponse()).toContain(
						'The value of MY_VAR is "three"'
					),
				WAIT_FOR_OPTIONS
			);

			await waitForValidConfigRestart();
		}
	);
});
