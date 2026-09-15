import { afterEach, beforeEach, describe, test, vi } from "vitest";
import { debounce } from "../../utils/debounce";

describe("debounce", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	test("invokes the function once after the delay has elapsed", ({
		expect,
	}) => {
		const fn = vi.fn();
		const debounced = debounce(fn, 100);

		debounced();
		vi.advanceTimersByTime(99);
		expect(fn).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	test("collapses a burst of calls into a single invocation", ({ expect }) => {
		const fn = vi.fn();
		const debounced = debounce(fn, 100);

		for (let i = 0; i < 10; i++) {
			debounced();
			vi.advanceTimersByTime(10);
		}
		expect(fn).not.toHaveBeenCalled();

		vi.advanceTimersByTime(100);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	test("starts a new delay for calls made after an invocation", ({
		expect,
	}) => {
		const fn = vi.fn();
		const debounced = debounce(fn, 100);

		debounced();
		vi.advanceTimersByTime(100);
		expect(fn).toHaveBeenCalledTimes(1);

		debounced();
		vi.advanceTimersByTime(100);
		expect(fn).toHaveBeenCalledTimes(2);
	});

	test("cancel() discards a pending invocation", ({ expect }) => {
		const fn = vi.fn();
		const debounced = debounce(fn, 100);

		debounced();
		debounced.cancel();
		vi.advanceTimersByTime(1000);

		expect(fn).not.toHaveBeenCalled();
	});

	test("cancel() does not prevent later invocations", ({ expect }) => {
		const fn = vi.fn();
		const debounced = debounce(fn, 100);

		debounced();
		debounced.cancel();
		debounced();
		vi.advanceTimersByTime(100);

		expect(fn).toHaveBeenCalledTimes(1);
	});

	test("cancel() is a no-op when nothing is pending", ({ expect }) => {
		const fn = vi.fn();
		const debounced = debounce(fn, 100);

		expect(() => debounced.cancel()).not.toThrow();

		debounced();
		vi.advanceTimersByTime(100);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(() => debounced.cancel()).not.toThrow();
	});
});
