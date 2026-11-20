import { setTimeout } from "node:timers/promises";
import { beforeEach, describe, it, vi } from "vitest";
import { APIError } from "../src/parse";
import { retryWhileVersionNotReadable } from "../src/retry";
import type { Logger } from "../src/logger";

vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn() }));

const logger: Logger = {
	debug: vi.fn(),
	log: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
};

function apiError(status: number, code: number) {
	const error = new APIError({
		text: "A request to the Cloudflare API failed.",
		status,
		telemetryMessage: false,
	});
	error.code = code;
	return error;
}

function versionNotFoundError() {
	return apiError(404, 100146);
}

function waits() {
	return vi.mocked(setTimeout).mock.calls.map(([delay]) => delay);
}

describe("retryWhileVersionNotReadable", () => {
	beforeEach(() => {
		vi.mocked(setTimeout).mockResolvedValue(undefined);
	});

	it("retries with backoff while the version is not found", async ({
		expect,
	}) => {
		const read = vi
			.fn<() => Promise<string>>()
			.mockRejectedValueOnce(versionNotFoundError())
			.mockRejectedValueOnce(versionNotFoundError())
			.mockResolvedValue("version");

		await expect(retryWhileVersionNotReadable(read, logger)).resolves.toBe(
			"version"
		);
		expect(read).toHaveBeenCalledTimes(3);
		expect(waits()).toEqual([500, 1500]);
	});

	it("does not retry other client errors", async ({ expect }) => {
		const error = apiError(403, 10000);
		const read = vi.fn<() => Promise<string>>().mockRejectedValue(error);

		await expect(retryWhileVersionNotReadable(read, logger)).rejects.toBe(
			error
		);
		expect(read).toHaveBeenCalledOnce();
		expect(setTimeout).not.toHaveBeenCalled();
	});

	it("throws the last not found error after about 12 seconds", async ({
		expect,
	}) => {
		const lastError = versionNotFoundError();
		const read = vi.fn<() => Promise<string>>().mockRejectedValue(lastError);
		for (let i = 0; i < 5; i++) {
			read.mockRejectedValueOnce(versionNotFoundError());
		}

		await expect(retryWhileVersionNotReadable(read, logger)).rejects.toBe(
			lastError
		);
		expect(read).toHaveBeenCalledTimes(6);
		expect(waits()).toEqual([500, 1500, 2500, 3500, 4500]);
	});
});
