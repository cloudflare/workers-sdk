import { describe, test } from "vitest";
import { formatAlarmLog } from "../../src/runtime/structured-logs";

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

	test("formats alarm handler completed log", ({ expect }) => {
		const result = formatAlarmLog("alarm handler completed");
		expect(result).not.toBeNull();
		expect(result).toContain("DO Alarm");
		expect(result).toContain("Ok");
	});

	test("formats alarm execution failed log", ({ expect }) => {
		const result = formatAlarmLog("alarm execution failed");
		expect(result).not.toBeNull();
		expect(result).toContain("DO Alarm");
		expect(result).toContain("Failed");
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
});
