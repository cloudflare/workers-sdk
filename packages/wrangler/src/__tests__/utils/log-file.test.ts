import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
/* eslint-disable workers-sdk/no-vitest-import-expect -- expect used in helper function at module scope */
import { beforeEach, describe, expect, it, vi } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { appendToDebugLogFile, debugLogFilepath } from "../../utils/log-file";
import { runInTempDir } from "../helpers/run-in-tmp";

describe("appendToDebugLogFile", () => {
	runInTempDir();

	beforeEach(() => {
		vi.stubEnv("WRANGLER_LOG_PATH", "logs");
	});

	function getLogFileContent(): string {
		if (existsSync(debugLogFilepath)) {
			return readFileSync(debugLogFilepath, "utf8");
		}

		if (existsSync("logs")) {
			const logFiles = readdirSync("logs");
			expect(logFiles.length).toBeGreaterThan(0);

			const logFilePath = join("logs", logFiles[0]);
			return readFileSync(logFilePath, "utf8");
		}

		throw new Error(
			`No log files found. debugLogFilepath: ${debugLogFilepath}, logs dir exists: ${existsSync("logs")}`
		);
	}

	it("should strip ANSI escape codes from error messages", async () => {
		const messageWithAnsi = "\u001b[31mError: Something went wrong\u001b[0m";
		const expectedCleanMessage = "Error: Something went wrong";

		await appendToDebugLogFile("error", messageWithAnsi);

		const logContent = getLogFileContent();
		expect(logContent).toContain(expectedCleanMessage);
		expect(logContent).not.toContain("\u001b[31m");
		expect(logContent).not.toContain("\u001b[0m");
	});

	it("should strip complex ANSI escape sequences", async () => {
		const messageWithComplexAnsi =
			"\u001b[1;32mSuccess:\u001b[0m \u001b[33mWarning text\u001b[0m";
		const expectedCleanMessage = "Success: Warning text";

		await appendToDebugLogFile("log", messageWithComplexAnsi);

		const logContent = getLogFileContent();
		expect(logContent).toContain(expectedCleanMessage);
		expect(logContent).not.toContain("\u001b[1;32m");
		expect(logContent).not.toContain("\u001b[33m");
	});

	it("should preserve plain messages without ANSI codes", async () => {
		const plainMessage = "This is a plain log message";

		await appendToDebugLogFile("info", plainMessage);

		const logContent = getLogFileContent();
		expect(logContent).toContain(plainMessage);
	});

	it("should handle multiline messages with ANSI codes", async () => {
		const multilineMessageWithAnsi =
			"\u001b[31mLine 1 with color\u001b[0m\nLine 2 plain\n\u001b[32mLine 3 with different color\u001b[0m";
		const expectedCleanMessage =
			"Line 1 with color\nLine 2 plain\nLine 3 with different color";

		await appendToDebugLogFile("warn", multilineMessageWithAnsi);

		const logContent = getLogFileContent();
		expect(logContent).toContain(expectedCleanMessage);
		expect(logContent).not.toContain("\u001b[31m");
		expect(logContent).not.toContain("\u001b[32m");
	});

	it("should maintain timestamp and log level formatting", async () => {
		const message = "\u001b[31mTest message\u001b[0m";

		await appendToDebugLogFile("error", message);

		const logContent = getLogFileContent();
		expect(logContent).toMatch(
			/--- \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z error/
		);
		expect(logContent).toContain("Test message");
		expect(logContent).toContain("---");
	});

	it("should handle empty messages", async () => {
		await appendToDebugLogFile("debug", "");

		const logContent = getLogFileContent();
		expect(logContent).toMatch(
			/--- \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z debug/
		);
	});

	it("should handle messages with only ANSI codes", async () => {
		const onlyAnsiMessage = "\u001b[31m\u001b[0m";

		await appendToDebugLogFile("log", onlyAnsiMessage);

		const logContent = getLogFileContent();
		expect(logContent).not.toContain("\u001b[31m");
		expect(logContent).not.toContain("\u001b[0m");
		expect(logContent).toMatch(
			/--- \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z log/
		);
	});
});
