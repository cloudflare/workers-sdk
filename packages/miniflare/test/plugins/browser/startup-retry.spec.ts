import assert from "node:assert";
import { afterEach, beforeEach, test, vi } from "vitest";
import { retryBrowserStartup } from "../../test-shared/browser";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

test("retries a Chrome readiness failure returned by a quick-action warm-up", async ({
	expect,
}) => {
	const quickAction = vi
		.fn<() => Promise<Response>>()
		.mockResolvedValueOnce(
			Response.json(
				{
					success: false,
					errors: [
						{
							code: 6002,
							detail:
								"Chrome readiness probe at http://127.0.0.1:51397/json/version timed out after 5000ms",
						},
					],
				},
				{ status: 422 }
			)
		)
		.mockResolvedValueOnce(new Response("<p>warm</p>"));
	const warmup = retryBrowserStartup(async () => {
		const response = await quickAction();
		assert.strictEqual(response.status, 200, await response.text());
	});
	const completed = expect(warmup).resolves.toBeUndefined();
	await vi.advanceTimersByTimeAsync(999);
	expect(quickAction).toHaveBeenCalledTimes(1);
	await vi.advanceTimersByTimeAsync(1);
	await completed;
	expect(quickAction).toHaveBeenCalledTimes(2);
});

test("preserves the final launch error after exhausting the startup retries", async ({
	expect,
}) => {
	const error = new Error("Failed to launch the browser process");
	const launch = vi.fn<() => Promise<void>>().mockRejectedValue(error);
	const failed = expect(retryBrowserStartup(launch)).rejects.toBe(error);
	await vi.runAllTimersAsync();
	await failed;
	expect(launch).toHaveBeenCalledTimes(4);
});

test("does not retry an unrelated unsuccessful warm-up response", async ({
	expect,
}) => {
	const quickAction = vi
		.fn<() => Promise<Response>>()
		.mockResolvedValue(
			Response.json(
				{ success: false, errors: [{ message: "Invalid options" }] },
				{ status: 400 }
			)
		);
	await expect(
		retryBrowserStartup(async () => {
			const response = await quickAction();
			assert.strictEqual(response.status, 200, await response.text());
		})
	).rejects.toThrow("Invalid options");
	expect(quickAction).toHaveBeenCalledTimes(1);
	expect(vi.getTimerCount()).toBe(0);
});
