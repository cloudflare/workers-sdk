import * as path from "node:path";
import { test, vi } from "vitest";
import {
	getTextResponse,
	isBuild,
	mockFileChange,
	viteServer,
	viteTestUrl,
	WAIT_FOR_OPTIONS,
} from "../../__test-utils__";

test.runIf(!isBuild)(
	"serves requests and watches config after workerd crashes",
	async ({ expect }) => {
		if (!("restart" in viteServer)) {
			throw new Error("Expected a Vite dev server");
		}

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
		const restart = vi.spyOn(viteServer, "restart");

		// This request is not expected to complete, since it crashes the runtime
		// that is serving it, so keep the abort short to avoid stalling the test.
		const crashResponse = await fetch(`${viteTestUrl}/__crash-workerd`, {
			signal: AbortSignal.timeout(2_000),
		}).catch(() => undefined);
		expect(crashResponse?.ok).not.toBe(true);

		// Requests can succeed before Vite finishes swapping servers and attaching
		// config watchers. Wait for the crash recovery itself before editing config.
		await vi.waitFor(
			() => expect(restart).toHaveBeenCalled(),
			WAIT_FOR_OPTIONS
		);
		await restart.mock.results[0]?.value;

		// Keep probes bounded, but leave enough time for a cold runtime to answer
		// on slow Windows CI runners.
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

		mockFileChange(path.join(__dirname, "../cloudflare.config.ts"), (content) =>
			content.replace('bindings.text("one")', 'bindings.text("two")')
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
