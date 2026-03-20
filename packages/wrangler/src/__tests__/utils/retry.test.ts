import { APIError } from "@cloudflare/workers-utils";
import { beforeEach, describe, it } from "vitest";
import { logger } from "../../logger";
import { retryOnAPIFailure } from "../../utils/retry";
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
				throw new APIError({ status: 500, text: "500 error" });
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
				throw new APIError({ status: 500, text: "500 error" });
			})
		).rejects.toMatchInlineSnapshot(`[APIError: 500 error]`);
		expect(attempts).toBe(3);
		expect(getRetryAndErrorLogs(std.debug)).toMatchInlineSnapshot(`
			[
			  "Retrying API call after error...",
			  "APIError: 500 error",
			  "Retrying API call after error...",
			  "APIError: 500 error",
			  "Retrying API call after error...",
			  "APIError: 500 error",
			]
		`);
	});

	it("should not retry non-5xx errors", async ({ expect }) => {
		let attempts = 0;

		await expect(() =>
			retryOnAPIFailure(() => {
				attempts++;
				throw new APIError({ status: 401, text: "401 error" });
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
				throw new APIError({ status: 500, text: "500 error" });
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
				throw new CustomAPIError({ status: 401, text: "401 error" });
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
