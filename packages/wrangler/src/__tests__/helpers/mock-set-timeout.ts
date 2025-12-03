import { afterEach, beforeEach, vi } from "vitest";
import type { MockInstance } from "vitest";

let setTimeoutSpy: MockInstance;

export function mockSetTimeout() {
	beforeEach(() => {
		setTimeoutSpy = vi
			.spyOn(global, "setTimeout")
			// @ts-expect-error we're using a very simple setTimeout mock here
			.mockImplementation((fn, _period) => {
				setImmediate(fn);
			});
	});

	afterEach(() => {
		setTimeoutSpy.mockRestore();
	});
}
