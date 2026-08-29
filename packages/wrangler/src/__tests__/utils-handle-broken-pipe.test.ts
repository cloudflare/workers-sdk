import { EventEmitter } from "node:events";
import { describe, it, vi } from "vitest";
import { handleBrokenPipe } from "../utils/handle-broken-pipe";

function errorWithCode(code: string) {
	return Object.assign(new Error(`write ${code}`), {
		code,
		syscall: "write",
	});
}

describe("handleBrokenPipe()", () => {
	for (const code of ["EPIPE", "ERR_STREAM_DESTROYED"]) {
		it(`exits quietly when the stream fails with ${code}`, ({ expect }) => {
			const stream = new EventEmitter();
			const onBrokenPipe = vi.fn();

			handleBrokenPipe([stream], onBrokenPipe);
			stream.emit("error", errorWithCode(code));

			expect(onBrokenPipe).toHaveBeenCalledOnce();
		});
	}

	it("installs a listener on every stream it is given", ({ expect }) => {
		const stdout = new EventEmitter();
		const stderr = new EventEmitter();
		const onBrokenPipe = vi.fn();

		handleBrokenPipe([stdout, stderr], onBrokenPipe);

		expect(stdout.listenerCount("error")).toBe(1);
		expect(stderr.listenerCount("error")).toBe(1);

		stderr.emit("error", errorWithCode("EPIPE"));
		expect(onBrokenPipe).toHaveBeenCalledOnce();
	});

	it("re-throws stdio errors that are not a broken pipe", ({ expect }) => {
		const stream = new EventEmitter();
		const onBrokenPipe = vi.fn();
		const error = errorWithCode("ENOSPC");

		handleBrokenPipe([stream], onBrokenPipe);

		expect(() => stream.emit("error", error)).toThrow(error);
		expect(onBrokenPipe).not.toHaveBeenCalled();
	});

	it("does not swallow an error with no code", ({ expect }) => {
		const stream = new EventEmitter();
		const onBrokenPipe = vi.fn();
		const error = new Error("something else went wrong");

		handleBrokenPipe([stream], onBrokenPipe);

		expect(() => stream.emit("error", error)).toThrow(error);
		expect(onBrokenPipe).not.toHaveBeenCalled();
	});
});
