import * as util from "node:util";
import { afterEach, beforeEach, vi } from "vitest";
import { normalizeString } from "./normalize";
import type { MockInstance } from "vitest";

/**
 * We use this module to mock console methods, and optionally
 * assert on the values they're called with in our tests.
 */

let debugSpy: MockInstance,
	logSpy: MockInstance,
	infoSpy: MockInstance,
	errorSpy: MockInstance,
	warnSpy: MockInstance;

/**
 * An object containing the normalized output of each console method.
 *
 * We use `defineProperties` to add non enumerable methods to the object,
 * so they don't show up in test assertions that iterate over the object's keys.
 * i.e. `expect(std).toMatchInlineSnapshot('...')`;
 */
const std = Object.defineProperties(
	{ debug: "", out: "", info: "", err: "", warn: "", getAndClearOut: () => "" },
	{
		debug: {
			get: () => normalizeOutput(debugSpy),
			enumerable: true,
		},
		out: {
			get: () => normalizeOutput(logSpy),
			enumerable: true,
		},
		info: {
			get: () => normalizeOutput(infoSpy),
			enumerable: true,
		},
		err: {
			get: () => normalizeOutput(errorSpy),
			enumerable: true,
		},
		warn: {
			get: () => normalizeOutput(warnSpy),
			enumerable: true,
		},
		/**
		 * Return the content of the mocked stdout and clear the mock's history.
		 *
		 * Helpful for tests that need to assert on multiple sequential console outputs.
		 */
		getAndClearOut: {
			value: () => {
				const output = normalizeOutput(logSpy);
				logSpy.mockClear();
				return output;
			},
			enumerable: false,
		},
	}
);

function normalizeOutput(spy: MockInstance, join = "\n"): string {
	return normalizeString(captureCalls(spy, join));
}

function captureCalls(spy: MockInstance, join = "\n"): string {
	return spy.mock.calls
		.map((args: unknown[]) => util.format("%s", ...args))
		.join(join);
}

export function mockConsoleMethods() {
	beforeEach(() => {
		debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
	});
	afterEach(() => {
		debugSpy.mockRestore();
		logSpy.mockRestore();
		infoSpy.mockRestore();
		errorSpy.mockRestore();
		warnSpy.mockRestore();
	});
	return std;
}
