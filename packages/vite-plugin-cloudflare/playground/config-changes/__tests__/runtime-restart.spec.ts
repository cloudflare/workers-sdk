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

		const crashResponse = await fetch(`${viteTestUrl}/__crash-workerd`, {
			signal: AbortSignal.timeout(2_000),
		}).catch(() => undefined);
		expect(crashResponse?.ok).not.toBe(true);

		await vi.waitFor(async () => {
			const runtimeId = await fetch(`${viteTestUrl}/__runtime-id`, {
				signal: AbortSignal.timeout(2_000),
			}).then((response) => response.text());
			expect(runtimeId).not.toBe(initialRuntimeId);

			const response = await fetch(viteTestUrl, {
				signal: AbortSignal.timeout(2_000),
			});
			expect(response.ok).toBe(true);
			expect(await response.text()).toContain('The value of MY_VAR is "one"');
		}, WAIT_FOR_OPTIONS);
	},
	20_000
);
