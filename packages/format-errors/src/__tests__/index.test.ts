import { describe, expect, it, vi } from "vitest";
import type { Payload } from "../index";

// Mock external dependencies that can't be resolved by Vite in test env
vi.mock("promjs", () => {
	const mockCounter = { inc: vi.fn() };
	const mockRegistry = {
		create: vi.fn(() => mockCounter),
		metrics: vi.fn(() => ""),
	};
	return { default: () => mockRegistry };
});

vi.mock("toucan-js", () => {
	return {
		Toucan: vi.fn().mockImplementation(() => ({
			captureException: vi.fn(),
		})),
	};
});

describe("handlePrettyErrorRequest", () => {
	it("should propagate async rejections to callers", async () => {
		// Mock Youch to throw asynchronously
		vi.doMock("../Youch", () => {
			return {
				default: vi.fn().mockImplementation(() => ({
					addLink: vi.fn(),
					toHTML: vi.fn().mockRejectedValue(new Error("Youch async error")),
				})),
			};
		});

		// handlePrettyErrorRequest is async — if it's not awaited, async
		// rejections (e.g. from Youch.toHTML()) won't be caught by a
		// surrounding try/catch, leading to unhandled promise rejections.
		// This test verifies that the function properly rejects so that
		// callers who `await` it can catch the error.
		const { handlePrettyErrorRequest } = await import("../index");

		const payload: Payload = {
			url: "https://example.com",
			method: "GET",
			headers: { "content-type": "text/html" },
			error: {
				message: "Test error",
				name: "Error",
				stack: "Error: Test error\n    at test:1:1",
			},
		};

		await expect(handlePrettyErrorRequest(payload)).rejects.toThrow(
			"Youch async error"
		);
	});
});

describe("reviveError", () => {
	it("should revive a plain Error", async () => {
		const { reviveError } = await import("../index");
		const error = reviveError({
			message: "test",
			name: "Error",
			stack: "Error: test\n    at foo:1:1",
		});
		expect(error).toBeInstanceOf(Error);
		expect(error.message).toBe("test");
		expect(error.name).toBe("Error");
		expect(error.stack).toBe("Error: test\n    at foo:1:1");
	});

	it("should revive a TypeError", async () => {
		const { reviveError } = await import("../index");
		const error = reviveError({
			message: "x is not a function",
			name: "TypeError",
		});
		expect(error).toBeInstanceOf(TypeError);
		expect(error.message).toBe("x is not a function");
	});

	it("should revive an error with a cause", async () => {
		const { reviveError } = await import("../index");
		const error = reviveError({
			message: "outer",
			name: "Error",
			cause: {
				message: "inner",
				name: "RangeError",
			},
		});
		expect(error).toBeInstanceOf(Error);
		expect(error.message).toBe("outer");
		expect(error.cause).toBeInstanceOf(RangeError);
		expect((error.cause as Error).message).toBe("inner");
	});

	it("should fall back to Error for unknown error names", async () => {
		const { reviveError } = await import("../index");
		const error = reviveError({
			message: "custom",
			name: "CustomError",
		});
		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe("CustomError");
	});
});
