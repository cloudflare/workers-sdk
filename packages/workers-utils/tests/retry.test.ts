import { describe, it, vi } from "vitest";
import { throwFetchError } from "../src/cfetch";
import { APIError } from "../src/parse";
import { retryOnAPIFailure, retryOnUnreadableVersion } from "../src/retry";
import type { Logger } from "../src/logger";

// Resolve the waits between attempts immediately, so that a full retry schedule
// can run in a unit test, and record how long each wait would have been.
const sleepMock = vi.hoisted(() => vi.fn<(wait: number) => Promise<void>>());
vi.mock("node:timers/promises", () => ({ setTimeout: sleepMock }));

const logger: Logger = {
	debug: vi.fn(),
	log: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
};

/**
 * Fails in the same way as a request to the Cloudflare API that returned an error.
 *
 * @param status The HTTP status of the response
 * @param code The Cloudflare API error code in the response
 */
function failAPIRequest(status: number, code: number): never {
	throwFetchError(
		"/accounts/some-account-id/workers/scripts/my-worker/versions/some-version-id",
		{
			success: false,
			result: null,
			errors: [{ code, message: "The request failed." }],
		},
		status
	);
}

/** @returns The milliseconds waited before each retry */
function getWaits(): number[] {
	return sleepMock.mock.calls.map(([wait]) => wait);
}

describe("retryOnAPIFailure", () => {
	it("should retry errors that `shouldRetry` identifies", async ({
		expect,
	}) => {
		let attempts = 0;

		const result = await retryOnAPIFailure(
			() => {
				attempts++;
				if (attempts < 3) {
					throw new Error("not ready");
				}
				return "ready";
			},
			logger,
			undefined,
			undefined,
			undefined,
			(err) => err instanceof Error && err.message === "not ready"
		);

		expect(result).toBe("ready");
		expect(attempts).toBe(3);
		expect(getWaits()).toEqual([0, 1000]);
	});

	it("should not retry errors that `shouldRetry` rejects", async ({
		expect,
	}) => {
		let attempts = 0;

		await expect(
			retryOnAPIFailure(
				() => {
					attempts++;
					throw new Error("some error");
				},
				logger,
				undefined,
				undefined,
				undefined,
				() => false
			)
		).rejects.toThrow("some error");
		expect(attempts).toBe(1);
		expect(getWaits()).toEqual([]);
	});

	it("should let `shouldRetry` decide about errors that are retried by default", async ({
		expect,
	}) => {
		let attempts = 0;

		await expect(
			retryOnAPIFailure(
				() => {
					attempts++;
					failAPIRequest(500, 10000);
				},
				logger,
				undefined,
				undefined,
				undefined,
				() => false
			)
		).rejects.toBeInstanceOf(APIError);
		expect(attempts).toBe(1);
		expect(getWaits()).toEqual([]);
	});
});

describe("retryOnUnreadableVersion", () => {
	it("should return the version without waiting when it is readable", async ({
		expect,
	}) => {
		const result = await retryOnUnreadableVersion(
			() => ({ id: "some-version-id" }),
			logger
		);

		expect(result).toEqual({ id: "some-version-id" });
		expect(getWaits()).toEqual([]);
		expect(logger.info).not.toHaveBeenCalled();
	});

	it("should retry until the version becomes readable", async ({ expect }) => {
		let attempts = 0;

		const result = await retryOnUnreadableVersion(() => {
			attempts++;
			if (attempts < 4) {
				failAPIRequest(404, 100146);
			}
			return { id: "some-version-id" };
		}, logger);

		expect(result).toEqual({ id: "some-version-id" });
		expect(attempts).toBe(4);
		// The first retry is immediate, then each one waits a second longer.
		expect(getWaits()).toEqual([0, 1000, 2000]);
	});

	it("should explain the wait once, however many retries there are", async ({
		expect,
	}) => {
		let attempts = 0;

		await retryOnUnreadableVersion(() => {
			attempts++;
			if (attempts < 4) {
				failAPIRequest(404, 100146);
			}
			return { id: "some-version-id" };
		}, logger);

		expect(logger.info).toHaveBeenCalledExactlyOnceWith(
			expect.stringContaining(
				"The Cloudflare API could not find a Worker version."
			)
		);
	});

	it("should give up when the version stays unreadable for about a minute", async ({
		expect,
	}) => {
		let attempts = 0;

		await expect(
			retryOnUnreadableVersion(() => {
				attempts++;
				failAPIRequest(404, 100146);
			}, logger)
		).rejects.toMatchObject({ code: 100146, status: 404 });

		expect(attempts).toBe(12);
		expect(getWaits().reduce((total, wait) => total + wait, 0)).toBe(55_000);
	});

	it("should not retry other errors for a resource that cannot be found", async ({
		expect,
	}) => {
		let attempts = 0;

		await expect(
			retryOnUnreadableVersion(() => {
				attempts++;
				// 10007: the Worker itself does not exist.
				failAPIRequest(404, 10007);
			}, logger)
		).rejects.toMatchObject({ code: 10007, status: 404 });

		expect(attempts).toBe(1);
		expect(getWaits()).toEqual([]);
		expect(logger.info).not.toHaveBeenCalled();
	});

	it("should not retry errors that are not from the API", async ({
		expect,
	}) => {
		let attempts = 0;

		await expect(
			retryOnUnreadableVersion(() => {
				attempts++;
				throw new Error("some error");
			}, logger)
		).rejects.toThrow("some error");

		expect(attempts).toBe(1);
	});

	// These are retried by default, but would otherwise be given the long wait
	// that is only meant for a version that is not readable yet.
	it.for([500, 503, 429])(
		"should not retry a %d response",
		async (status, { expect }) => {
			let attempts = 0;

			await expect(
				retryOnUnreadableVersion(() => {
					attempts++;
					failAPIRequest(status, 10000);
				}, logger)
			).rejects.toMatchObject({ status });

			expect(attempts).toBe(1);
			expect(getWaits()).toEqual([]);
		}
	);

	it("should not retry a network failure", async ({ expect }) => {
		let attempts = 0;

		await expect(
			retryOnUnreadableVersion(() => {
				attempts++;
				throw new TypeError("fetch failed");
			}, logger)
		).rejects.toThrow("fetch failed");

		expect(attempts).toBe(1);
		expect(getWaits()).toEqual([]);
	});
});
