import { afterEach, beforeEach, describe, test, vi } from "vitest";
import {
	error,
	getLogLevel,
	logRaw,
	runWithLogLevel,
	setLogLevel,
} from "../index";
import { collectCLIOutput } from "../test-util";

vi.mock("../streams", async () => {
	const { PassThrough } = await import("node:stream");
	return { stdout: new PassThrough(), stderr: new PassThrough() };
});

describe("runWithLogLevel", () => {
	const std = collectCLIOutput();
	const defaultLogLevel = getLogLevel();
	beforeEach(() => setLogLevel("log"));
	afterEach(() => setLogLevel(defaultLogLevel));

	test("suppresses progress while preserving errors and the callback result", ({
		expect,
	}) => {
		const result = runWithLogLevel("warn", () => {
			logRaw("hidden progress");
			error("visible error");
			return 42;
		});
		logRaw("outside progress");
		expect(result).toBe(42);
		expect(std.out).toBe("outside progress\n");
		expect(std.err).toContain("visible error");
	});

	test("retains nested levels across asynchronous continuations", async ({
		expect,
	}) => {
		await runWithLogLevel("warn", async () => {
			await Promise.resolve();
			expect(getLogLevel()).toBe("warn");
			await runWithLogLevel("debug", async () => {
				await Promise.resolve();
				logRaw("nested progress");
			});
			expect(getLogLevel()).toBe("warn");
			logRaw("hidden outer progress");
		});
		expect(std.out).toBe("nested progress\n");
		expect(getLogLevel()).toBe("log");
	});

	test("preserves global level changes made while a scoped call is pending", async ({
		expect,
	}) => {
		const resume = Promise.withResolvers<void>();
		const scoped = runWithLogLevel("warn", async () => {
			await resume.promise;
			logRaw("hidden scoped progress");
		});
		setLogLevel("debug");
		logRaw("concurrent progress");
		resume.resolve();
		await scoped;
		expect(std.out).toBe("concurrent progress\n");
		expect(getLogLevel()).toBe("debug");
	});

	test("propagates rejection without affecting subsequent output", async ({
		expect,
	}) => {
		const failure = new Error("scoped work failed");
		await expect(
			runWithLogLevel("warn", async () => {
				await Promise.resolve();
				throw failure;
			})
		).rejects.toBe(failure);
		logRaw("progress after rejection");
		expect(std.out).toBe("progress after rejection\n");
		expect(getLogLevel()).toBe("log");
	});
});
