import { main } from "../index";

/**
 * Run the wrangler CLI tool in tests, capturing the logging output.
 */
export async function runWrangler(cmd?: string) {
  const logSpy = jest.spyOn(console, "log").mockImplementation();
  const errorSpy = jest.spyOn(console, "error").mockImplementation();
  const warnSpy = jest.spyOn(console, "warn").mockImplementation();
  try {
    let error: unknown = undefined;
    try {
      await main(cmd?.split(" ") ?? []);
    } catch (e) {
      error = e;
    }
    return {
      error,
      stdout: captureCalls(logSpy),
      stderr: captureCalls(errorSpy),
      warnings: captureCalls(warnSpy),
    };
  } finally {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  }
}

function captureCalls(spy: jest.SpyInstance): string {
  return spy.mock.calls.flat(2).join("\n");
}
