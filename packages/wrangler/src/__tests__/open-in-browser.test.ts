import { EventEmitter } from "node:events";
import { vi, describe, it, beforeEach } from "vitest";
import { mockConsoleMethods } from "./helpers/mock-console";
import type openInBrowserDefault from "../open-in-browser";

// Mock the `open` package so we don't actually launch a browser during tests.
// We control what it returns or throws per-test.
vi.mock("open");

describe("openInBrowser", () => {
	const std = mockConsoleMethods();

	// Import after the mock is set up so we get the real openInBrowser
	// (the global setup mocks the default export but here we test the real impl).
	let openInBrowser: typeof openInBrowserDefault;
	let mockOpen: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const openModule = await import("open");
		mockOpen = vi.mocked(openModule.default);
		// Each test configures mockOpen.mockImplementation as needed.

		// Use vi.importActual to bypass the global vi.mock("../open-in-browser")
		// that the vitest.setup.ts installs — we want the real implementation here.
		const mod = (await vi.importActual("../open-in-browser")) as {
			default: typeof openInBrowserDefault;
		};
		openInBrowser = mod.default;
	});

	it("resolves when open() succeeds", async ({ expect }) => {
		const fakeProcess = new EventEmitter();
		mockOpen.mockResolvedValue(fakeProcess);

		await expect(openInBrowser("https://example.com")).resolves.toBeUndefined();
		expect(std.warn).toBe("");
	});

	it("logs a warning and the URL when open() throws ENOENT", async ({
		expect,
	}) => {
		const enoentError = Object.assign(new Error("spawn xdg-open ENOENT"), {
			code: "ENOENT",
			path: "/path/to/wrangler-dist/xdg-open",
		});
		mockOpen.mockRejectedValue(enoentError);

		await expect(openInBrowser("https://example.com")).resolves.toBeUndefined();
		expect(std.warn).toContain("Failed to open a browser automatically");
		expect(std.warn).toContain("https://example.com");
	});

	it("re-throws non-ENOENT errors from open()", async ({ expect }) => {
		const permError = Object.assign(new Error("EPERM"), { code: "EPERM" });
		mockOpen.mockRejectedValue(permError);

		await expect(openInBrowser("https://example.com")).rejects.toThrow("EPERM");
	});

	it("logs a warning and the URL when the child process emits ENOENT", async ({
		expect,
	}) => {
		const fakeProcess = new EventEmitter();
		mockOpen.mockResolvedValue(fakeProcess);

		const openPromise = openInBrowser("https://example.com");
		// Allow the internal `await open(url)` microtask to settle so the error
		// handler is registered before we emit the error event.
		await Promise.resolve();

		const enoentError = Object.assign(new Error("spawn ENOENT"), {
			code: "ENOENT",
		});
		fakeProcess.emit("error", enoentError);

		await expect(openPromise).resolves.toBeUndefined();
		expect(std.warn).toContain("Failed to open a browser automatically");
		expect(std.warn).toContain("https://example.com");
	});
});
