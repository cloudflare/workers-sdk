import { beforeEach, afterEach } from "vitest";
import type { SpyInstance } from "vitest";
/**
 * We use this module to mock console methods, and optionally
 * assert on the values they're called with in our tests.
 */

let logSpy: SpyInstance, errorSpy: SpyInstance, warnSpy: SpyInstance;

const std = {
  get out() {
    return stripTrailingWhitespace(
      normalizeSlashes(stripTimings(logSpy.mock.calls.flat(2).join("\n")))
    );
  },
  get err() {
    return stripTrailingWhitespace(
      normalizeSlashes(stripTimings(errorSpy.mock.calls.flat(2).join("\n")))
    );
  },
  get warn() {
    return stripTrailingWhitespace(
      normalizeSlashes(stripTimings(warnSpy.mock.calls.flat(2).join("\n")))
    );
  },
};

export function mockConsoleMethods() {
  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
  return std;
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
