import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("fake timers", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("uses fake time", () => {
		const date = new Date(2023, 0, 1);
		vi.setSystemTime(date);
		expect(date).toMatchInlineSnapshot(`2023-01-01T00:00:00.000Z`);
	});
});
