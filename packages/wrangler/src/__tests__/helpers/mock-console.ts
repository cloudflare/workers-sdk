import * as util from "node:util";
import { afterEach, beforeEach, vi } from "vitest";
import { logger } from "../../logger";
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

const std = {
	get debug() {
		return normalizeOutput(debugSpy);
	},
	get out() {
		return normalizeOutput(logSpy);
	},
	get info() {
		return normalizeOutput(infoSpy);
	},
	get err() {
		return normalizeOutput(errorSpy);
	},
	get warn() {
		return normalizeOutput(warnSpy);
	},
};

function normalizeOutput(spy: MockInstance): string {
	return normalizeString(captureCalls(spy));
}

function captureCalls(spy: MockInstance): string {
	return spy.mock.calls
		.map((args: unknown[]) => util.format("%s", ...args))
		.join("\n");
}

export function mockConsoleMethods() {
	beforeEach(() => {
		logger.columns = 100;
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
