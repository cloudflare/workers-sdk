import { describe, it } from "vitest";
import {
	castErrorCause,
	serialiseError,
} from "../../../api/startDevWorker/events";

describe("castErrorCause", () => {
	it("returns Error instances unchanged", ({ expect }) => {
		const cause = new TypeError("boom");
		expect(castErrorCause(cause)).toBe(cause);
	});

	it("rehydrates a SerializedError, preserving message/name/stack", ({
		expect,
	}) => {
		// Regression test for https://github.com/cloudflare/workers-sdk/issues/14641:
		// the ProxyWorker's error reports cross a JSON channel, so they arrive as
		// plain objects. castErrorCause used to wrap them in a message-less
		// `new Error()`, making the fatal log an empty `✘ [ERROR]` with no clue
		// about the actual failure (e.g. "Network connection lost.").
		const original = new Error("Network connection lost.");
		const serialized = JSON.parse(
			JSON.stringify(serialiseError(original))
		) as unknown;

		const error = castErrorCause(serialized);

		expect(error).toBeInstanceOf(Error);
		expect(error.message).toBe("Network connection lost.");
		expect(error.name).toBe("Error");
		expect(error.stack).toBe(original.stack);
	});

	it("preserves the serialized nested cause", ({ expect }) => {
		const original = new Error("outer", { cause: new Error("inner") });
		const serialized = JSON.parse(
			JSON.stringify(serialiseError(original))
		) as unknown;

		const error = castErrorCause(serialized);

		expect(error.message).toBe("outer");
		expect(error.cause).toMatchObject({ message: "inner" });
	});

	it("wraps other non-Error causes, keeping them as `cause`", ({ expect }) => {
		const error = castErrorCause("string cause");

		expect(error).toBeInstanceOf(Error);
		expect(error.message).toBe("");
		expect(error.cause).toBe("string cause");
	});
});
