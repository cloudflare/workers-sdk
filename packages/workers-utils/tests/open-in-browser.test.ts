import { EventEmitter } from "node:events";
import { beforeEach, describe, it, vi } from "vitest";
import { openInBrowser } from "../src/open-in-browser";
import type { Logger } from "../src/logger";

// Mock the `open` package so we don't actually launch a browser during tests.
// We control what it returns or throws per-test.
vi.mock("open");

function createMockLogger(): Logger {
	return {
		debug: vi.fn(),
		log: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	};
}

describe("openInBrowser", () => {
	let mockOpen: ReturnType<typeof vi.fn>;
	let logger: Logger;

	beforeEach(async () => {
		const openModule = await import("open");
		mockOpen = vi.mocked(openModule.default);
		logger = createMockLogger();
	});

	it("resolves when open() succeeds", async ({ expect }) => {
		const fakeProcess = new EventEmitter();
		mockOpen.mockResolvedValue(fakeProcess);

		await expect(
			openInBrowser("https://example.com", logger)
		).resolves.toBeUndefined();
		expect(logger.warn).not.toHaveBeenCalled();
	});

	it("logs a warning and the URL when open() throws ENOENT", async ({
		expect,
	}) => {
		const enoentError = Object.assign(new Error("spawn xdg-open ENOENT"), {
			code: "ENOENT",
			path: "/path/to/wrangler-dist/xdg-open",
		});
		mockOpen.mockRejectedValue(enoentError);

		await expect(
			openInBrowser("https://example.com", logger)
		).resolves.toBeUndefined();
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining("Failed to open a browser automatically")
		);
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining("https://example.com")
		);
	});

	it("re-throws non-ENOENT errors from open()", async ({ expect }) => {
		const permError = Object.assign(new Error("EPERM"), { code: "EPERM" });
		mockOpen.mockRejectedValue(permError);

		await expect(openInBrowser("https://example.com", logger)).rejects.toThrow(
			"EPERM"
		);
	});

	it("logs a warning and the URL when the child process emits ENOENT", async ({
		expect,
	}) => {
		const fakeProcess = new EventEmitter();
		mockOpen.mockResolvedValue(fakeProcess);

		const openPromise = openInBrowser("https://example.com", logger);
		// Allow the internal `await import("open")` + `await open(url)` microtasks
		// to settle so the error handler is registered before we emit the error
		// event. A macrotask tick flushes the whole pending microtask queue,
		// regardless of how many awaits precede the handler registration.
		await new Promise((resolve) => setImmediate(resolve));

		const enoentError = Object.assign(new Error("spawn ENOENT"), {
			code: "ENOENT",
		});
		fakeProcess.emit("error", enoentError);

		await expect(openPromise).resolves.toBeUndefined();
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining("Failed to open a browser automatically")
		);
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining("https://example.com")
		);
	});
});
