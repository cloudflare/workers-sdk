import { afterEach, beforeEach, it, vi } from "vitest";

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

it("fake system time", ({ expect }) => {
	const date = new Date(2023, 0, 1);
	vi.setSystemTime(date);
	expect(new Date()).toMatchInlineSnapshot(`2023-01-01T00:00:00.000Z`);
});

it("advances fake time", ({ expect }) => {
	const fn = vi.fn(() => {});
	setTimeout(fn, 1000);
	vi.advanceTimersByTime(500);
	expect(fn).not.toHaveBeenCalled();
	vi.advanceTimersByTime(500);
	expect(fn).toHaveBeenCalled();
});
