import {
	APIError,
	retryOnAPIFailure as retryOnAPIFailureWithLogger,
} from "@cloudflare/workers-utils";
import { beforeEach, describe, it } from "vitest";
import { logger } from "../../logger";
import { mockConsoleMethods } from "../helpers/mock-console";

describe("retryOnAPIFailure", () => {
	const std = mockConsoleMethods();

	beforeEach(() => {
		const level = logger.loggerLevel;
		logger.loggerLevel = "debug";
		return () => (logger.loggerLevel = level);
	});

	it("should retry 5xx errors and succeed if the 3rd try succeeds", async ({
		expect,
	}) => {
		let attempts = 0;

		await retryOnAPIFailure(() => {
			attempts++;
			if (attempts < 3) {
				throw new APIError({
					status: 500,
					text: "500 error",
					telemetryMessage: false,
				});
			}
		});
		expect(attempts).toBe(3);
		expect(getRetryAndErrorLogs(std.debug)).toMatchInlineSnapshot(`
			[
			  "Retrying API call after error...",
			  "APIError: 500 error",
			  "Retrying API call after error...",
			  "APIError: 500 error",
			]
		`);
	});

	it("should throw 5xx error after all retries fail", async ({ expect }) => {
		let attempts = 0;

		await expect(() =>
			retryOnAPIFailure(() => {
				attempts++;
				throw new APIError({
					status: 500,
					text: "500 error",
					telemetryMessage: false,
				});
			})
		).rejects.toMatchInlineSnapshot(`[APIError: 500 error]`);
		expect(attempts).toBe(3);
		expect(getRetryAndErrorLogs(std.debug)).toMatchInlineSnapshot(`
			[
			  "Retrying API call after error...",
			  "APIError: 500 error",
			  "Retrying API call after error...",
			  "APIError: 500 error",
			]
		`);
	});

	it("should retry 429 errors and succeed if the 3rd try succeeds", async ({
		expect,
	}) => {
		let attempts = 0;

		await retryOnAPIFailure(() => {
			attempts++;
			if (attempts < 3) {
				throw new APIError({
					status: 429,
					text: "429 error",
					telemetryMessage: false,
				});
			}
		});
		expect(attempts).toBe(3);
	});

	it("should wait for the duration in retryAfterMs instead of the computed backoff", async ({
		expect,
	}) => {
		let attempts = 0;
		const start = Date.now();

		// Pass a large initial `backoff` (3s) so that, if `retryAfterMs` were
		// *not* being honoured, this test would take several seconds. The
		// thrown error's `retryAfterMs` (10ms) should take precedence.
		await retryOnAPIFailure(
			() => {
				attempts++;
				if (attempts < 2) {
					const err = new APIError({
						status: 429,
						text: "429 error",
						telemetryMessage: false,
					});
					err.retryAfterMs = 10;
					throw err;
				}
			},
			3000,
			2
		);

		expect(attempts).toBe(2);
		// Comfortably above the 10ms retryAfterMs (plus up to 1s jitter), but
		// well below the 3s backoff that would apply if retryAfterMs were ignored.
		expect(Date.now() - start).toBeLessThan(2000);
	});

	it("should honour Retry-After on 5xx errors too, instead of the computed backoff", async ({
		expect,
	}) => {
		let attempts = 0;
		const start = Date.now();

		await retryOnAPIFailure(
			() => {
				attempts++;
				if (attempts < 2) {
					const err = new APIError({
						status: 500,
						text: "500 error",
						telemetryMessage: false,
					});
					err.retryAfterMs = 10;
					throw err;
				}
			},
			3000,
			2
		);

		expect(attempts).toBe(2);
		expect(Date.now() - start).toBeLessThan(2000);
	});

	it("should fail fast without retrying when Retry-After exceeds the cap", async ({
		expect,
	}) => {
		let attempts = 0;

		await expect(() =>
			retryOnAPIFailure(() => {
				attempts++;
				const err = new APIError({
					status: 429,
					text: "429 error",
					telemetryMessage: false,
				});
				// Longer than MAX_RETRY_AFTER_MS (60s) — we should not block on it.
				err.retryAfterMs = 120_000;
				throw err;
			})
		).rejects.toMatchObject({ retryAfterMs: 120_000 });
		expect(attempts).toBe(1);
	});

	it("should fail fast on a 5xx whose Retry-After exceeds the cap, rather than exhausting retries", async ({
		expect,
	}) => {
		let attempts = 0;

		await expect(() =>
			retryOnAPIFailure(() => {
				attempts++;
				const err = new APIError({
					status: 503,
					text: "503 error",
					telemetryMessage: false,
				});
				// Longer than MAX_RETRY_AFTER_MS (60s) — we should not block on it,
				// even though 5xx errors are otherwise always retried.
				err.retryAfterMs = 120_000;
				throw err;
			})
		).rejects.toMatchObject({ retryAfterMs: 120_000 });
		expect(attempts).toBe(1);
	});

	it("should log a message when waiting on a Retry-After header", async ({
		expect,
	}) => {
		let attempts = 0;

		await retryOnAPIFailure(() => {
			attempts++;
			if (attempts < 2) {
				const err = new APIError({
					status: 429,
					text: "429 error",
					telemetryMessage: false,
				});
				err.retryAfterMs = 0;
				throw err;
			}
		});

		expect(attempts).toBe(2);
		expect(std.info).toContain(
			'Received a "Retry-After" header from the Cloudflare API. Waiting 0 second(s) before retrying...'
		);
	});

	it("should not retry non-5xx errors", async ({ expect }) => {
		let attempts = 0;

		await expect(() =>
			retryOnAPIFailure(() => {
				attempts++;
				throw new APIError({
					status: 401,
					text: "401 error",
					telemetryMessage: false,
				});
			})
		).rejects.toMatchInlineSnapshot(`[APIError: 401 error]`);
		expect(attempts).toBe(1);
		expect(getRetryAndErrorLogs(std.debug)).toMatchInlineSnapshot(`[]`);
	});

	it("should retry TypeError", async ({ expect }) => {
		let attempts = 0;

		await expect(() =>
			retryOnAPIFailure(() => {
				attempts++;
				throw new TypeError("type error");
			})
		).rejects.toMatchInlineSnapshot(`[TypeError: type error]`);
		expect(attempts).toBe(3);
		expect(getRetryAndErrorLogs(std.debug)).toMatchInlineSnapshot(`
			[
			  "Retrying API call after error...",
			  "Retrying API call after error...",
			]
		`);
	});

	it("should not retry other errors", async ({ expect }) => {
		let attempts = 0;

		await expect(() =>
			retryOnAPIFailure(() => {
				attempts++;
				throw new Error("some error");
			})
		).rejects.toMatchInlineSnapshot(`[Error: some error]`);
		expect(attempts).toBe(1);
		expect(getRetryAndErrorLogs(std.debug)).toMatchInlineSnapshot(`[]`);
	});

	it("should cancel retry backoff when abort signal fires", async ({
		expect,
	}) => {
		const controller = new AbortController();
		let attempts = 0;

		const promise = retryOnAPIFailure(
			() => {
				attempts++;
				if (attempts === 1) {
					// After the first failure, abort before the backoff completes
					queueMicrotask(() => controller.abort());
				}
				throw new APIError({
					status: 500,
					text: "500 error",
					telemetryMessage: false,
				});
			},
			// Use a very long backoff so the test would hang without abort
			10_000,
			3,
			controller.signal
		);

		await expect(promise).rejects.toThrow();
		// Only the first attempt should have been made before the abort
		// cancelled the backoff delay
		expect(attempts).toBe(1);
	});

	it("should propagate abort error from action without retrying", async ({
		expect,
	}) => {
		const controller = new AbortController();
		controller.abort();
		let attempts = 0;

		await expect(() =>
			retryOnAPIFailure(
				() => {
					attempts++;
					throw controller.signal.reason;
				},
				undefined,
				undefined,
				controller.signal
			)
		).rejects.toThrow();
		// AbortError is not an APIError or TypeError, so it should not be retried
		expect(attempts).toBe(1);
	});

	it("should retry TimeoutError from AbortSignal.timeout()", async ({
		expect,
	}) => {
		let attempts = 0;

		await expect(() =>
			retryOnAPIFailure(() => {
				attempts++;
				throw new DOMException("The operation was aborted.", "TimeoutError");
			})
		).rejects.toThrow("The operation was aborted.");
		expect(attempts).toBe(3);
		expect(getRetryAndErrorLogs(std.debug)).toMatchInlineSnapshot(`
			[
			  "Retrying API call after error...",
			  "Retrying API call after error...",
			]
		`);
	});

	it("should retry custom APIError implementation with non-5xx error", async ({
		expect,
	}) => {
		let checkedCustomIsRetryable = false;
		class CustomAPIError extends APIError {
			isRetryable(): boolean {
				checkedCustomIsRetryable = true;
				return true;
			}
		}

		let attempts = 0;

		await expect(() =>
			retryOnAPIFailure(() => {
				attempts++;
				throw new CustomAPIError({
					status: 401,
					text: "401 error",
					telemetryMessage: false,
				});
			})
		).rejects.toMatchInlineSnapshot(`[CustomAPIError: 401 error]`);
		expect(attempts).toBe(3);
		expect(checkedCustomIsRetryable).toBe(true);
		expect(getRetryAndErrorLogs(std.debug)).toMatchInlineSnapshot(`
			[
			  "Retrying API call after error...",
			  "CustomAPIError: 401 error",
			  "Retrying API call after error...",
			  "CustomAPIError: 401 error",
			]
		`);
	});
});

function getRetryAndErrorLogs(debugOutput: string): string[] {
	return debugOutput
		.split("\n")
		.filter((line) => line.includes("Retrying") || line.includes("APIError"));
}

function retryOnAPIFailure<T>(
	action: () => T | Promise<T>,
	backoff?: number,
	attempts?: number,
	abortSignal?: AbortSignal
): Promise<T> {
	return retryOnAPIFailureWithLogger(
		action,
		logger,
		backoff,
		attempts,
		abortSignal
	);
}
