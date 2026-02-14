import { Readable } from "node:stream";
import { afterEach, describe, test, vi } from "vitest";
import {
	formatAlarmLog,
	handleStructuredLogsFromStream,
} from "../../src/runtime/structured-logs";

describe("formatAlarmLog", () => {
	test("formats Durable Object alarm starting log", ({ expect }) => {
		const result = formatAlarmLog(
			"Durable Object 'MyDurableObject' alarm starting"
		);
		expect(result).not.toBeNull();
		expect(result).toContain("DO Alarm");
		expect(result).toContain("MyDurableObject");
		expect(result).toContain("Starting");
	});

	test("formats Durable Object alarm running log", ({ expect }) => {
		const result = formatAlarmLog("Durable Object 'TestObject' alarm running");
		expect(result).not.toBeNull();
		expect(result).toContain("DO Alarm");
		expect(result).toContain("TestObject");
	});

	test("formats Durable Object alarm completed log", ({ expect }) => {
		const result = formatAlarmLog("Durable Object 'MyClass' alarm completed");
		expect(result).not.toBeNull();
		expect(result).toContain("DO Alarm");
		expect(result).toContain("MyClass");
		expect(result).toContain("Ok");
	});

	test("formats Durable Object alarm failed log", ({ expect }) => {
		const result = formatAlarmLog("Durable Object 'FailingDO' alarm failed");
		expect(result).not.toBeNull();
		expect(result).toContain("DO Alarm");
		expect(result).toContain("FailingDO");
		expect(result).toContain("Failed");
	});

	test("returns null for vague alarm messages without Durable Object prefix", ({
		expect,
	}) => {
		// These messages should NOT be formatted as they could be user logs
		expect(formatAlarmLog("alarm handler completed")).toBeNull();
		expect(formatAlarmLog("alarm execution failed")).toBeNull();
		expect(formatAlarmLog("alarm ok")).toBeNull();
		expect(formatAlarmLog("fire alarm error detected")).toBeNull();
	});

	test("returns null for non-alarm log", ({ expect }) => {
		const result = formatAlarmLog("Some random log message");
		expect(result).toBeNull();
	});

	test("returns null for request log", ({ expect }) => {
		const result = formatAlarmLog("GET /api/users 200 OK");
		expect(result).toBeNull();
	});

	test("formats case-insensitive alarm logs", ({ expect }) => {
		const result1 = formatAlarmLog("Durable Object 'Test' ALARM starting");
		const result2 = formatAlarmLog("DURABLE OBJECT 'Test' alarm COMPLETED");
		expect(result1).not.toBeNull();
		expect(result2).not.toBeNull();
	});

	test("does not capture trailing whitespace in class name without quotes", ({
		expect,
	}) => {
		// When class name is not quoted, we should not capture trailing space
		const result = formatAlarmLog("Durable Object MyClass alarm starting");
		expect(result).not.toBeNull();
		// Check that there's no double space (which would indicate trailing whitespace was captured)
		expect(result).not.toContain("  ");
		expect(result).toContain("MyClass");
	});
});

describe("handleStructuredLogsFromStream - alarm log formatting", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("Durable Object alarm logs ARE formatted", ({ expect }) => {
		const receivedLogs: { level: string; message: string }[] = [];
		const handler = (log: { level: string; message: string }) => {
			receivedLogs.push(log);
		};

		const stream = new Readable({ read() {} });
		handleStructuredLogsFromStream(stream, handler);

		// This is the format workerd uses for DO alarm logs
		const workerdAlarmMessage =
			"Durable Object 'MyDurableObject' alarm starting";
		const structuredLog = JSON.stringify({
			timestamp: Date.now().toString(),
			level: "info",
			message: workerdAlarmMessage,
		});
		stream.push(structuredLog + "\n");

		return new Promise<void>((resolve) => {
			setImmediate(() => {
				expect(receivedLogs).toHaveLength(1);
				// Should be formatted as "DO Alarm"
				expect(receivedLogs[0].message).toContain("DO Alarm");
				expect(receivedLogs[0].message).toContain("MyDurableObject");
				expect(receivedLogs[0].message).toContain("Starting");
				resolve();
			});
		});
	});

	test("user console.log messages containing 'alarm' are NOT reformatted", ({
		expect,
	}) => {
		// These are examples of user application logs that should NOT be hijacked
		const userMessages = [
			"alarm handler completed",
			"alarm failed",
			"alarm ok",
			"fire alarm error detected",
			"Setting alarm for tomorrow",
			"alarm execution succeeded",
		];

		const receivedLogs: { level: string; message: string }[] = [];
		const handler = (log: { level: string; message: string }) => {
			receivedLogs.push(log);
		};

		const stream = new Readable({ read() {} });
		handleStructuredLogsFromStream(stream, handler);

		for (const message of userMessages) {
			const structuredLog = JSON.stringify({
				timestamp: Date.now().toString(),
				level: "log",
				message,
			});
			stream.push(structuredLog + "\n");
		}

		// Wait for stream processing
		return new Promise<void>((resolve) => {
			setImmediate(() => {
				// All user messages should be preserved exactly as written
				expect(receivedLogs).toHaveLength(userMessages.length);
				for (let i = 0; i < userMessages.length; i++) {
					expect(receivedLogs[i].message).toBe(userMessages[i]);
					// Should NOT contain "DO Alarm" formatting
					expect(receivedLogs[i].message).not.toContain("DO Alarm");
				}
				resolve();
			});
		});
	});

	test("user console.log messages are passed through unchanged", ({
		expect,
	}) => {
		const receivedLogs: { level: string; message: string }[] = [];
		const handler = (log: { level: string; message: string }) => {
			receivedLogs.push(log);
		};

		const stream = new Readable({ read() {} });
		handleStructuredLogsFromStream(stream, handler);

		const userMessage = "My application log with alarm status update";
		const structuredLog = JSON.stringify({
			timestamp: Date.now().toString(),
			level: "log",
			message: userMessage,
		});
		stream.push(structuredLog + "\n");

		return new Promise<void>((resolve) => {
			setImmediate(() => {
				expect(receivedLogs).toHaveLength(1);
				expect(receivedLogs[0].message).toBe(userMessage);
				resolve();
			});
		});
	});
});
