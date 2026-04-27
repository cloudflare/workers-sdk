import { describe, it } from "vitest";
import {
	checkWorkerNameValidity,
	toValidWorkerName,
} from "../utils/worker-name-validation";

describe("checkWorkerNameValidity()", () => {
	it("should accept a simple valid name", ({ expect }) => {
		expect(checkWorkerNameValidity("my-worker")).toEqual({ valid: true });
	});

	it("should accept a name with only lowercase letters", ({ expect }) => {
		expect(checkWorkerNameValidity("worker")).toEqual({ valid: true });
	});

	it("should accept a name with numbers", ({ expect }) => {
		expect(checkWorkerNameValidity("worker123")).toEqual({ valid: true });
	});

	it("should accept a name with dashes in the middle", ({ expect }) => {
		expect(checkWorkerNameValidity("my-cool-worker")).toEqual({
			valid: true,
		});
	});

	it("should accept a single character name", ({ expect }) => {
		expect(checkWorkerNameValidity("a")).toEqual({ valid: true });
	});

	it("should accept a name that is exactly 63 characters", ({ expect }) => {
		const name = "a".repeat(63);
		expect(checkWorkerNameValidity(name)).toEqual({ valid: true });
	});

	it("should reject an empty string", ({ expect }) => {
		const result = checkWorkerNameValidity("");
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.cause).toBe("Worker names cannot be empty.");
		}
	});

	it("should reject a name starting with a dash", ({ expect }) => {
		const result = checkWorkerNameValidity("-my-worker");
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.cause).toBe(
				"Worker names cannot start or end with a dash."
			);
		}
	});

	it("should reject a name ending with a dash", ({ expect }) => {
		const result = checkWorkerNameValidity("my-worker-");
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.cause).toBe(
				"Worker names cannot start or end with a dash."
			);
		}
	});

	it("should reject a name with uppercase characters", ({ expect }) => {
		const result = checkWorkerNameValidity("MyWorker");
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.cause).toBe(
				"Project names must only contain lowercase characters, numbers, and dashes."
			);
		}
	});

	it("should reject a name with underscores", ({ expect }) => {
		const result = checkWorkerNameValidity("my_worker");
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.cause).toBe(
				"Project names must only contain lowercase characters, numbers, and dashes."
			);
		}
	});

	it("should reject a name with special characters", ({ expect }) => {
		const result = checkWorkerNameValidity("my@worker!");
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.cause).toBe(
				"Project names must only contain lowercase characters, numbers, and dashes."
			);
		}
	});

	it("should reject a name longer than 63 characters", ({ expect }) => {
		const name = "a".repeat(64);
		const result = checkWorkerNameValidity(name);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.cause).toBe(
				"Project names must be less than 63 characters."
			);
		}
	});
});

describe("toValidWorkerName()", () => {
	it("should return an already-valid name unchanged", ({ expect }) => {
		expect(toValidWorkerName("my-worker")).toBe("my-worker");
	});

	it("should replace underscores with dashes", ({ expect }) => {
		expect(toValidWorkerName("my_cool_worker")).toBe("my-cool-worker");
	});

	it("should replace special characters with dashes", ({ expect }) => {
		// @ and ! are replaced with dashes, then trailing dash is stripped
		expect(toValidWorkerName("my@worker!")).toBe("my-worker");
	});

	it("should strip leading dashes after normalization", ({ expect }) => {
		expect(toValidWorkerName("--my-worker")).toBe("my-worker");
	});

	it("should strip trailing dashes after normalization", ({ expect }) => {
		expect(toValidWorkerName("my-worker--")).toBe("my-worker");
	});

	it("should lowercase uppercase letters", ({ expect }) => {
		expect(toValidWorkerName("MyWorker")).toBe("myworker");
	});

	it("should truncate names longer than 63 characters", ({ expect }) => {
		const longName = "a".repeat(100);
		const result = toValidWorkerName(longName);
		expect(result.length).toBeLessThanOrEqual(63);
		expect(result).toBe("a".repeat(63));
	});

	it("should return 'my-worker' when input normalizes to empty string", ({
		expect,
	}) => {
		expect(toValidWorkerName("@@@")).toBe("my-worker");
	});

	it("should handle a mix of underscores and special characters", ({
		expect,
	}) => {
		expect(toValidWorkerName("my_cool@worker")).toBe("my-cool-worker");
	});

	it("should return the input unchanged if already valid", ({ expect }) => {
		expect(toValidWorkerName("hello-world-123")).toBe("hello-world-123");
	});
});
