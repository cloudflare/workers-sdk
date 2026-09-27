import { PassThrough } from "node:stream";
import { describe, it } from "vitest";
import { registerOutputStreamErrorHandler } from "../../output-stream-errors";

describe("registerOutputStreamErrorHandler", () => {
	it("keeps the process alive when an output consumer closes the pipe", ({
		expect,
	}) => {
		const stream = new PassThrough();
		registerOutputStreamErrorHandler(stream);

		const error = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });

		expect(() => stream.emit("error", error)).not.toThrow();
	});

	it("does not swallow unrelated output errors", ({ expect }) => {
		const stream = new PassThrough();
		registerOutputStreamErrorHandler(stream);

		const error = Object.assign(new Error("write failed"), { code: "EIO" });

		expect(() => stream.emit("error", error)).toThrow(error);
	});
});
