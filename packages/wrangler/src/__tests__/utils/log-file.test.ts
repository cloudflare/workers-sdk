import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { utimes } from "node:fs/promises";
import { join } from "node:path";
/* eslint-disable workers-sdk/no-vitest-import-expect -- expect used in helper function at module scope */
import { beforeEach, describe, expect, it, vi } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import {
	appendToDebugLogFile,
	cleanupOldLogFiles,
	debugLogFilepath,
	initLogFileCleanup,
} from "../../utils/log-file";
import { runInTempDir } from "../helpers/run-in-tmp";
import type { ExpectStatic } from "vitest";

describe("appendToDebugLogFile", () => {
	runInTempDir();

	beforeEach(() => {
		vi.stubEnv("WRANGLER_LOG_PATH", "logs");
	});

	function getLogFileContent(expect: ExpectStatic): string {
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

	it("should strip ANSI escape codes from error messages", async ({
		expect,
	}) => {
		const messageWithAnsi = "\u001b[31mError: Something went wrong\u001b[0m";
		const expectedCleanMessage = "Error: Something went wrong";

		await appendToDebugLogFile("error", messageWithAnsi);

		const logContent = getLogFileContent(expect);
		expect(logContent).toContain(expectedCleanMessage);
		expect(logContent).not.toContain("\u001b[31m");
		expect(logContent).not.toContain("\u001b[0m");
	});

	it("should strip complex ANSI escape sequences", async ({ expect }) => {
		const messageWithComplexAnsi =
			"\u001b[1;32mSuccess:\u001b[0m \u001b[33mWarning text\u001b[0m";
		const expectedCleanMessage = "Success: Warning text";

		await appendToDebugLogFile("log", messageWithComplexAnsi);

		const logContent = getLogFileContent(expect);
		expect(logContent).toContain(expectedCleanMessage);
		expect(logContent).not.toContain("\u001b[1;32m");
		expect(logContent).not.toContain("\u001b[33m");
	});

	it("should preserve plain messages without ANSI codes", async ({
		expect,
	}) => {
		const plainMessage = "This is a plain log message";

		await appendToDebugLogFile("info", plainMessage);

		const logContent = getLogFileContent(expect);
		expect(logContent).toContain(plainMessage);
	});

	it("should handle multiline messages with ANSI codes", async ({ expect }) => {
		const multilineMessageWithAnsi =
			"\u001b[31mLine 1 with color\u001b[0m\nLine 2 plain\n\u001b[32mLine 3 with different color\u001b[0m";
		const expectedCleanMessage =
			"Line 1 with color\nLine 2 plain\nLine 3 with different color";

		await appendToDebugLogFile("warn", multilineMessageWithAnsi);

		const logContent = getLogFileContent(expect);
		expect(logContent).toContain(expectedCleanMessage);
		expect(logContent).not.toContain("\u001b[31m");
		expect(logContent).not.toContain("\u001b[32m");
	});

	it("should maintain timestamp and log level formatting", async ({
		expect,
	}) => {
		const message = "\u001b[31mTest message\u001b[0m";

		await appendToDebugLogFile("error", message);

		const logContent = getLogFileContent(expect);
		expect(logContent).toMatch(
			/--- \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z error/
		);
		expect(logContent).toContain("Test message");
		expect(logContent).toContain("---");
	});

	it("should handle empty messages", async ({ expect }) => {
		await appendToDebugLogFile("debug", "");

		const logContent = getLogFileContent(expect);
		expect(logContent).toMatch(
			/--- \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z debug/
		);
	});

	it("should handle messages with only ANSI codes", async ({ expect }) => {
		const onlyAnsiMessage = "\u001b[31m\u001b[0m";

		await appendToDebugLogFile("log", onlyAnsiMessage);

		const logContent = getLogFileContent(expect);
		expect(logContent).not.toContain("\u001b[31m");
		expect(logContent).not.toContain("\u001b[0m");
		expect(logContent).toMatch(
			/--- \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z log/
		);
	});
});

describe("cleanupOldLogFiles", () => {
	runInTempDir();

	async function createLogFile(logsDir: string, name: string, ageDays: number) {
		mkdirSync(logsDir, { recursive: true });
		const filePath = join(logsDir, name);
		writeFileSync(filePath, "test log content");
		// Set the file's modification time to simulate its age
		const mtime = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
		await utimes(filePath, mtime, mtime);
		return filePath;
	}

	it("should delete log files older than 7 days by default", async () => {
		const logsDir = "test-logs";
		const oldFile = await createLogFile(
			logsDir,
			"wrangler-old.log",
			8 // 8 days old — should be deleted
		);
		const recentFile = await createLogFile(
			logsDir,
			"wrangler-recent.log",
			3 // 3 days old — should be kept
		);

		await cleanupOldLogFiles(logsDir);

		expect(existsSync(oldFile)).toBe(false);
		expect(existsSync(recentFile)).toBe(true);
	});

	it("should respect the WRANGLER_LOG_MAX_AGE_DAYS env variable", async () => {
		vi.stubEnv("WRANGLER_LOG_MAX_AGE_DAYS", "30");

		const logsDir = "test-logs-custom";
		const oldFile = await createLogFile(logsDir, "wrangler-old.log", 31);
		const recentFile = await createLogFile(logsDir, "wrangler-recent.log", 10);

		await cleanupOldLogFiles(logsDir);

		expect(existsSync(oldFile)).toBe(false);
		expect(existsSync(recentFile)).toBe(true);
	});

	it("should not delete non-wrangler log files", async () => {
		const logsDir = "test-logs-other";
		const otherFile = await createLogFile(logsDir, "other-app.log", 10);

		await cleanupOldLogFiles(logsDir);

		expect(existsSync(otherFile)).toBe(true);
	});

	it("should silently succeed if the logs directory does not exist", async () => {
		await expect(cleanupOldLogFiles("nonexistent-dir")).resolves.not.toThrow();
	});
});

describe("initLogFileCleanup", () => {
	runInTempDir();

	beforeEach(() => {
		vi.stubEnv("WRANGLER_LOG_PATH", "logs");
	});

	it("should be idempotent (calling it twice does not throw)", () => {
		expect(() => initLogFileCleanup()).not.toThrow();
		expect(() => initLogFileCleanup()).not.toThrow();
	});

	it("should skip cleanup when WRANGLER_LOG_PATH points to an exact .log file", () => {
		vi.stubEnv("WRANGLER_LOG_PATH", "custom-debug.log");
		expect(() => initLogFileCleanup()).not.toThrow();
	});
});
