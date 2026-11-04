import { describe, it, vi } from "vitest";
import { waitForMiniflareReady } from "../src/pool/miniflare-startup";

describe("Miniflare startup lifecycle", () => {
	it("returns a ready instance without disposing it", async ({ expect }) => {
		const dispose = vi.fn(async () => {});
		const mf = { dispose, ready: Promise.resolve(new URL("http://localhost")) };

		await expect(waitForMiniflareReady(mf)).resolves.toBe(mf);
		expect(dispose).not.toHaveBeenCalled();
	});

	it("disposes a failed instance and rethrows its error", async ({
		expect,
	}) => {
		const startupError = new Error("startup failed");
		const dispose = vi.fn(async () => {});
		const log = vi.fn();
		const mf = { dispose, ready: Promise.reject(startupError) };

		await expect(waitForMiniflareReady(mf, log)).rejects.toBe(startupError);
		expect(dispose).toHaveBeenCalledOnce();
		expect(log).not.toHaveBeenCalled();
	});

	it("logs a failed disposal without masking the startup error", async ({
		expect,
	}) => {
		const startupError = new Error("startup failed");
		const cleanupError = new Error("cleanup failed");
		const dispose = vi.fn(async () => {
			throw cleanupError;
		});
		const log = vi.fn();
		const mf = { dispose, ready: Promise.reject(startupError) };

		await expect(waitForMiniflareReady(mf, log)).rejects.toBe(startupError);
		expect(dispose).toHaveBeenCalledOnce();
		expect(log).toHaveBeenCalledExactlyOnceWith(
			"miniflare startup cleanup rejected: %O",
			cleanupError
		);
	});
});
