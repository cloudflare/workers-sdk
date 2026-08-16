import { test, vi } from "vitest";
import {
	getTextResponse,
	isBuild,
	viteTestUrl,
	WAIT_FOR_OPTIONS,
} from "../../__test-utils__";

test.runIf(!isBuild)(
	"serves requests after workerd crashes",
	async ({ expect }) => {
		await vi.waitFor(
			async () =>
				expect(await getTextResponse()).toContain(
					'The value of MY_VAR is "one"'
				),
			WAIT_FOR_OPTIONS
		);
		const initialRuntimeResponse = await fetch(`${viteTestUrl}/__runtime-id`);
		expect(initialRuntimeResponse.ok).toBe(true);
		const initialRuntimeId = await initialRuntimeResponse.text();

		// This request is not expected to complete, since it crashes the runtime
		// that is serving it, so keep the abort short to avoid stalling the test.
		const crashResponse = await fetch(`${viteTestUrl}/__crash-workerd`, {
			signal: AbortSignal.timeout(2_000),
		}).catch(() => undefined);
		expect(crashResponse?.ok).not.toBe(true);

		// These requests race a workerd restart, which is slow on Windows CI. The
		// aborts must be long enough for a cold runtime to answer, otherwise every
		// `waitFor` attempt aborts and the retries can never succeed.
		await vi.waitFor(async () => {
			const runtimeId = await fetch(`${viteTestUrl}/__runtime-id`, {
				signal: AbortSignal.timeout(10_000),
			}).then((response) => response.text());
			expect(runtimeId).not.toBe(initialRuntimeId);

			const response = await fetch(viteTestUrl, {
				signal: AbortSignal.timeout(10_000),
			});
			expect(response.ok).toBe(true);
			expect(await response.text()).toContain('The value of MY_VAR is "one"');
		}, WAIT_FOR_OPTIONS);
	}
);
