import * as fs from "node:fs";
import * as path from "node:path";
import { vi } from "vitest";
import { runInTempDir } from "../helpers/run-in-tmp";
import { appendToDebugLogFile, debugLogFilepath } from "../../utils/log-file";

describe("log-file utilities", () => {
	runInTempDir();

	beforeEach(() => {
		// Mock environment variable to control log file location
		vi.stubEnv("WRANGLER_LOG_PATH", "./test-logs");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("should strip ANSI colors from log messages", async () => {
		const messageWithAnsi = "\x1b[38;2;255;136;0m---------------------------\x1b[39m";
		const expectedStrippedMessage = "---------------------------";

		await appendToDebugLogFile("info", messageWithAnsi);

		// Check that log directory was created
		expect(fs.existsSync("./test-logs")).toBe(true);

		// Find the log file
		const logFiles = fs.readdirSync("./test-logs");
		expect(logFiles).toHaveLength(1);

		// Read the log file content
		const logContent = fs.readFileSync(
			path.join("./test-logs", logFiles[0]),
			"utf-8"
		);

		// Verify ANSI codes were stripped
		expect(logContent).toContain(expectedStrippedMessage);
		expect(logContent).not.toContain("\x1b[38;2;255;136;0m");
		expect(logContent).not.toContain("\x1b[39m");
		expect(logContent).toContain("info");
	});

	it("should strip complex ANSI sequences from warning messages", async () => {
		const warningMessageWithAnsi = "\x1b[33m▲ \x1b[43;33m[\x1b[43;30mWARNING\x1b[43;33m]\x1b[0m \x1b[1mkj/async-io-win32.c++:982: warning: Bind address resolved to multiple addresses.\x1b[0m";
		const expectedStrippedParts = [
			"▲ [WARNING]",
			"kj/async-io-win32.c++:982: warning: Bind address resolved to multiple addresses."
		];

		await appendToDebugLogFile("warn", warningMessageWithAnsi);

		// Find the log file
		const logFiles = fs.readdirSync("./test-logs");
		expect(logFiles).toHaveLength(1);

		// Read the log file content
		const logContent = fs.readFileSync(
			path.join("./test-logs", logFiles[0]),
			"utf-8"
		);

		// Verify ANSI codes were stripped but readable content remains
		expectedStrippedParts.forEach(part => {
			expect(logContent).toContain(part);
		});
		expect(logContent).not.toContain("\x1b[33m");
		expect(logContent).not.toContain("\x1b[43;33m");
		expect(logContent).not.toContain("\x1b[0m");
		expect(logContent).toContain("warn");
	});

	it("should handle messages without ANSI codes normally", async () => {
		const plainMessage = "This is a plain log message without any colors";

		await appendToDebugLogFile("error", plainMessage);

		// Find the log file
		const logFiles = fs.readdirSync("./test-logs");
		expect(logFiles).toHaveLength(1);

		// Read the log file content
		const logContent = fs.readFileSync(
			path.join("./test-logs", logFiles[0]),
			"utf-8"
		);

		// Verify plain message is preserved exactly
		expect(logContent).toContain(plainMessage);
		expect(logContent).toContain("error");
	});

	it("should handle filesystem errors gracefully", async () => {
		// Mock fs.appendFile to throw an error
		const appendFileSpy = vi.spyOn(fs.promises, "appendFile")
			.mockRejectedValue(new Error("Permission denied"));

		// Should not throw, but handle error internally
		await expect(
			appendToDebugLogFile("error", "test message")
		).resolves.not.toThrow();

		appendFileSpy.mockRestore();
	});

	it("should create log directory if it doesn't exist", async () => {
		// Use a nested directory path
		vi.stubEnv("WRANGLER_LOG_PATH", "./nested/log/path");

		await appendToDebugLogFile("debug", "test message");

		// Verify nested directory structure was created
		expect(fs.existsSync("./nested/log/path")).toBe(true);

		// Find the log file
		const logFiles = fs.readdirSync("./nested/log/path");
		expect(logFiles).toHaveLength(1);

		// Verify content
		const logContent = fs.readFileSync(
			path.join("./nested/log/path", logFiles[0]),
			"utf-8"
		);
		expect(logContent).toContain("test message");
		expect(logContent).toContain("debug");
	});

	it("should append multiple log entries to the same file", async () => {
		const message1WithAnsi = "\x1b[31mError message\x1b[0m";
		const message2WithAnsi = "\x1b[33mWarning message\x1b[0m";

		await appendToDebugLogFile("error", message1WithAnsi);
		await appendToDebugLogFile("warn", message2WithAnsi);

		// Find the log file
		const logFiles = fs.readdirSync("./test-logs");
		expect(logFiles).toHaveLength(1);

		// Read the log file content
		const logContent = fs.readFileSync(
			path.join("./test-logs", logFiles[0]),
			"utf-8"
		);

		// Verify both messages are present without ANSI codes
		expect(logContent).toContain("Error message");
		expect(logContent).toContain("Warning message");
		expect(logContent).not.toContain("\x1b[31m");
		expect(logContent).not.toContain("\x1b[33m");
		expect(logContent).not.toContain("\x1b[0m");

		// Verify log levels are recorded
		expect(logContent).toContain("error");
		expect(logContent).toContain("warn");

		// Verify timestamp format
		expect(logContent).toMatch(/--- \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z error/);
		expect(logContent).toMatch(/--- \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z warn/);
	});
});