import * as util from "node:util";
import { logger } from "../../logger";

/**
 * We use this module to mock console methods, and optionally
 * assert on the values they're called with in our tests.
 */

let debugSpy: jest.SpyInstance,
  logSpy: jest.SpyInstance,
  errorSpy: jest.SpyInstance,
  warnSpy: jest.SpyInstance;

const std = {
  get debug() {
    return normalizeOutput(debugSpy);
  },
  get out() {
    return normalizeOutput(logSpy);
  },
  get err() {
    return normalizeOutput(errorSpy);
  },
  get warn() {
    return normalizeOutput(warnSpy);
  },
};

function normalizeOutput(spy: jest.SpyInstance): string {
  return normalizeErrorMarkers(
    stripTrailingWhitespace(normalizeSlashes(stripTimings(captureCalls(spy))))
  );
}

function captureCalls(spy: jest.SpyInstance): string {
  return spy.mock.calls
    .map((args: unknown[]) => util.format("%s", ...args))
    .join("\n");
}

export function mockConsoleMethods() {
  beforeEach(() => {
    logger.columns = 100;
    debugSpy = jest.spyOn(console, "debug").mockImplementation();
    logSpy = jest.spyOn(console, "log").mockImplementation();
    errorSpy = jest.spyOn(console, "error").mockImplementation();
    warnSpy = jest.spyOn(console, "warn").mockImplementation();
  });
  afterEach(() => {
    debugSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
  return std;
}

/**
 * Normalize error `X` markers.
 *
 * Windows gets a different character.
 */
function normalizeErrorMarkers(str: string): string {
  return str.replaceAll("✘", "X");
}

/**
 * Ensure slashes in the `str` are OS file-system agnostic.
 *
 * Use this in snapshot tests to be resilient to file-system differences.
 */
export function normalizeSlashes(str: string): string {
  return str.replace(/\\/g, "/");
}

/**
 * Strip "timing data" out of the `stdout` string, since this is not always deterministic.
 *
 * Use this in snapshot tests to be resilient to slight changes in timing of processing.
 */
export function stripTimings(stdout: string): string {
  return stdout.replace(/\(\d+\.\d+ sec\)/g, "(TIMINGS)");
}

export function stripTrailingWhitespace(str: string): string {
  return str.replace(/[^\S\n]+\n/g, "\n");
}
