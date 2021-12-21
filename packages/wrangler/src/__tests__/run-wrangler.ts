import { main } from "../index";

/**
 * Run the wrangler CLI tool in tests, capturing the logging output.
 */
export async function runWrangler(cmd?: string) {
  const logSpy = jest.spyOn(console, "log").mockImplementation();
  const errorSpy = jest.spyOn(console, "error").mockImplementation();
  const warnSpy = jest.spyOn(console, "warn").mockImplementation();
  try {
    await main(cmd?.split(" ") ?? []);
    return {
      stdout: logSpy.mock.calls.flat(2).join("\n"),
      stderr: errorSpy.mock.calls.flat(2).join("\n"),
      warnings: warnSpy.mock.calls.flat(2).join("\n"),
    };
  } finally {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  }
}
