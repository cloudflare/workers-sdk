import * as fs from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appendToDebugLogFile } from "../../utils/log-file";

vi.mock("node:fs/promises", async (importOriginal) => {
	// eslint-disable-next-line @typescript-eslint/consistent-type-imports
	const fsOriginal = await importOriginal<typeof import("node:fs/promises")>();
	return {
		...fsOriginal,
		appendFile: vi.fn(),
	};
});

vi.mock("../../utils/filesystem", () => ({
	ensureDirectoryExists: vi.fn(),
}));

vi.mock("../../logger", () => ({
	logger: {
		error: vi.fn(),
		debug: vi.fn(),
		console: vi.fn(),
	},
}));

const mockAppendFile = vi.mocked(fs.appendFile);

describe("appendToDebugLogFile", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should strip ANSI escape codes from error messages", async () => {
		const messageWithAnsi = "\u001b[31mError: Something went wrong\u001b[0m";
		const expectedCleanMessage = "Error: Something went wrong";

		await appendToDebugLogFile("error", messageWithAnsi);

		expect(mockAppendFile).toHaveBeenCalledWith(
			expect.any(String),
			expect.stringContaining(expectedCleanMessage)
		);
		expect(mockAppendFile).toHaveBeenCalledWith(
			expect.any(String),
			expect.not.stringContaining("\u001b[31m")
		);
		expect(mockAppendFile).toHaveBeenCalledWith(
			expect.any(String),
			expect.not.stringContaining("\u001b[0m")
		);
	});

	it("should strip complex ANSI escape sequences", async () => {
		const messageWithComplexAnsi =
			"\u001b[1;32mSuccess:\u001b[0m \u001b[33mWarning text\u001b[0m";
		const expectedCleanMessage = "Success: Warning text";

		await appendToDebugLogFile("log", messageWithComplexAnsi);

		expect(mockAppendFile).toHaveBeenCalledWith(
			expect.any(String),
			expect.stringContaining(expectedCleanMessage)
		);
		expect(mockAppendFile).toHaveBeenCalledWith(
			expect.any(String),
			expect.not.stringContaining("\u001b[1;32m")
		);
		expect(mockAppendFile).toHaveBeenCalledWith(
			expect.any(String),
			expect.not.stringContaining("\u001b[33m")
		);
	});

	it("should preserve plain messages without ANSI codes", async () => {
		const plainMessage = "This is a plain log message";

		await appendToDebugLogFile("info", plainMessage);

		expect(mockAppendFile).toHaveBeenCalledWith(
			expect.any(String),
			expect.stringContaining(plainMessage)
		);
	});

	it("should handle multiline messages with ANSI codes", async () => {
		const multilineMessageWithAnsi =
			"\u001b[31mLine 1 with color\u001b[0m\nLine 2 plain\n\u001b[32mLine 3 with different color\u001b[0m";
		const expectedCleanMessage =
			"Line 1 with color\nLine 2 plain\nLine 3 with different color";

		await appendToDebugLogFile("warn", multilineMessageWithAnsi);

		expect(mockAppendFile).toHaveBeenCalledWith(
			expect.any(String),
			expect.stringContaining(expectedCleanMessage)
		);
		expect(mockAppendFile).toHaveBeenCalledWith(
			expect.any(String),
			expect.not.stringContaining("\u001b[31m")
		);
		expect(mockAppendFile).toHaveBeenCalledWith(
			expect.any(String),
			expect.not.stringContaining("\u001b[32m")
		);
	});

	it("should maintain timestamp and log level formatting", async () => {
		const message = "\u001b[31mTest message\u001b[0m";

		await appendToDebugLogFile("error", message);

		const logEntry = mockAppendFile.mock.calls[0][1] as string;
		expect(logEntry).toMatch(
			/^\n--- \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z error/
		);
		expect(logEntry).toContain("Test message");
		expect(logEntry).toContain("---");
	});

	it("should handle empty messages", async () => {
		await appendToDebugLogFile("debug", "");

		expect(mockAppendFile).toHaveBeenCalledWith(
			expect.any(String),
			expect.stringMatching(
				/^\n--- \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z debug\n\n---/
			)
		);
	});

	it("should handle messages with only ANSI codes", async () => {
		const onlyAnsiMessage = "\u001b[31m\u001b[0m";

		await appendToDebugLogFile("log", onlyAnsiMessage);

		const logEntry = mockAppendFile.mock.calls[0][1] as string;
		expect(logEntry).not.toContain("\u001b[31m");
		expect(logEntry).not.toContain("\u001b[0m");
		expect(logEntry).toMatch(
			/^\n--- \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z log\n\n---/
		);
	});
});
