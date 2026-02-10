import { afterEach, beforeEach, vi } from "vitest";
import type { MockInstance } from "vitest";

/**
 * We use this module to mock process methods (write only for now),
 * and optionally assert on the values they're called with in our tests.
 */

let writeSpy: MockInstance;

function captureLastWriteCall(spy: MockInstance): Buffer | undefined {
	const calls = spy.mock.calls;

	// Loop through and find the buffer in calls
	// (we don't know the index of the buffer in the calls array)
	const buffer = calls
		.map((call) => call[0])
		.find((call) => call instanceof Buffer);

	if (buffer instanceof Buffer) {
		return buffer;
	}
}

export function mockProcess() {
	beforeEach(() => {
		writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
	});
	afterEach(() => {
		writeSpy.mockRestore();
	});
	return {
		get write() {
			return captureLastWriteCall(writeSpy);
		},
	};
}
