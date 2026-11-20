import { afterEach, beforeEach, vi } from "vitest";
import type { MockInstance } from "vitest";

let setTimeoutSpy: MockInstance;

export function mockSetTimeout() {
	beforeEach(() => {
		setTimeoutSpy = vi
			.spyOn(global, "setTimeout")
			// @ts-expect-error -- The test substitutes an immediate callback for the timeout overloads
			.mockImplementation((fn, _period) => {
				return setImmediate(fn);
			});
	});

	afterEach(() => {
		setTimeoutSpy.mockRestore();
	});
}
