import * as path from "node:path";
import { describe, test, vi } from "vitest";
import {
	getTextResponse,
	isBuild,
	mockFileChange,
	serverLogs,
	WAIT_FOR_OPTIONS,
} from "../../__test-utils__";

async function waitForTextResponse(expected: string) {
	await vi.waitFor(async () => {
		const response = await getTextResponse();
		if (!response.includes(expected)) {
			throw new Error(
				`Expected response to contain ${JSON.stringify(expected)}`
			);
		}
	}, WAIT_FOR_OPTIONS);
}

async function restoreFileChange(
	fileChange: ReturnType<typeof mockFileChange>
) {
	if (fileChange.restore()) {
		await waitForTextResponse('The value of MY_VAR is "one"');
	}
}

async function withConfigChange(
	mutate: (content: string) => string,
	run: (fileChange: ReturnType<typeof mockFileChange>) => Promise<void>
) {
	const fileChange = mockFileChange(
		path.join(__dirname, "../cloudflare.config.ts"),
		mutate
	);

	try {
		await run(fileChange);
	} finally {
		await restoreFileChange(fileChange);
	}
}

describe("config-changes", () => {
	test.runIf(!isBuild)(
		"successfully updates when a var is updated in the Worker config",
		async () => {
			await waitForTextResponse('The value of MY_VAR is "one"');

			await withConfigChange(
				(content) =>
					content.replace('bindings.text("one")', 'bindings.text("two")'),
				async () => {
					await waitForTextResponse('The value of MY_VAR is "two"');
				}
			);
		}
	);

	test.runIf(!isBuild)(
		"reports and recovers from errors in updates to the Worker config",
		async ({ expect }) => {
			await waitForTextResponse('The value of MY_VAR is "one"');

			const errorCount = serverLogs.errors.length;
			await withConfigChange(
				(content) =>
					content.replace(
						"./src/index.ts",
						"./src/missing-after-broken-update.ts"
					),
				async (fileChange) => {
					await vi.waitFor(async () => {
						expect(serverLogs.errors.slice(errorCount).join()).toMatch(
							/Failed to resolve Worker entrypoint ".+missing-after-broken-update\.ts" for environment "ssr"/
						);
					}, WAIT_FOR_OPTIONS);

					// The restart triggered by the broken config fails and keeps the
					// current server running. A subsequent config change must still be
					// picked up.
					fileChange.update((content) =>
						content
							.replace("./src/missing-after-broken-update.ts", "./src/index.ts")
							.replace('bindings.text("one")', 'bindings.text("three")')
					);

					await waitForTextResponse('The value of MY_VAR is "three"');
				}
			);
		}
	);
});
