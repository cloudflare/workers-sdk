import { describe, it, vi } from "vitest";
import { waitForBunProxyMessages } from "../../api/test-harness-runtime";

describe("waitForBunProxyMessages", () => {
	it("allows Bun when proxy messages are delivered", async ({ expect }) => {
		await expect(
			waitForBunProxyMessages(() => Promise.resolve(true), 1)
		).resolves.toBeUndefined();
	});

	it("throws a UserError when Bun fails to deliver proxy messages", async ({
		expect,
	}) => {
		await expect(
			waitForBunProxyMessages(() => Promise.resolve(false), 1)
		).rejects.toMatchObject({
			message:
				"`createTestHarness()` could not start because Bun does not support the custom `fetch()` dispatcher required to deliver Miniflare's proxy control request. Run your tests using Node.js instead.",
			telemetryMessage: "test harness bun proxy request failed",
		});
	});

	it("throws a UserError when Bun does not deliver proxy messages", async ({
		expect,
	}) => {
		vi.useFakeTimers();

		try {
			const rejection = expect(
				waitForBunProxyMessages(() => new Promise<boolean>(() => {}), 100)
			).rejects.toMatchObject({
				message:
					"`createTestHarness()` could not start because Bun does not support the custom `fetch()` dispatcher required to deliver Miniflare's proxy control request. Run your tests using Node.js instead.",
				telemetryMessage: "test harness bun proxy request failed",
			});

			await vi.advanceTimersByTimeAsync(100);
			await rejection;
		} finally {
			vi.useRealTimers();
		}
	});
});
