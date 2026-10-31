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

async function changeFileAndWaitForRestart<T>(changeFile: () => T): Promise<T> {
	if (!("restart" in viteServer)) {
		throw new Error("Expected a Vite dev server");
	}

	const server = viteServer;
	const restart = server.restart;
	let completed = false;

	const trackedRestart = async () => {
		try {
			await restart();
		} finally {
			completed = true;
		}
	};
	server.restart = trackedRestart;

	try {
		const result = changeFile();
		if (result !== false) {
			await vi.waitUntil(() => completed, WAIT_FOR_OPTIONS);
		}
		return result;
	} finally {
		// A successful Vite restart replaces this method as part of swapping in
		// the new server. Restore it ourselves if the change or restart failed.
		if (server.restart === trackedRestart) {
			server.restart = restart;
		}
	}
}

async function restoreFileChange(
	fileChange: ReturnType<typeof mockFileChange>
) {
	if (await changeFileAndWaitForRestart(() => fileChange.restore())) {
		await waitForTextResponse('The value of MY_VAR is "one"');
	}
}

async function withConfigChange(
	mutate: (content: string) => string,
	run: (fileChange: ReturnType<typeof mockFileChange>) => Promise<void>
) {
	const fileChange = await changeFileAndWaitForRestart(() =>
		mockFileChange(path.join(__dirname, "../cloudflare.config.ts"), mutate)
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
					await changeFileAndWaitForRestart(() =>
						fileChange.update((content) =>
							content
								.replace(
									"./src/missing-after-broken-update.ts",
									"./src/index.ts"
								)
								.replace('bindings.text("one")', 'bindings.text("three")')
						)
					);

					await waitForTextResponse('The value of MY_VAR is "three"');
				}
			);
		}
	);
});
