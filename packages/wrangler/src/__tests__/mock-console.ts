/**
 * We use this module to mock console methods, and optionally
 * assert on the values they're called with in our tests.
 */

let logSpy: jest.SpyInstance,
  errorSpy: jest.SpyInstance,
  warnSpy: jest.SpyInstance;

const std = {
  get out() {
    return logSpy.mock.calls.flat(2).join("\n");
  },
  get err() {
    return errorSpy.mock.calls.flat(2).join("\n");
  },
  get warn() {
    return warnSpy.mock.calls.flat(2).join("\n");
  },
};

export function mockConsoleMethods() {
  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation();
    errorSpy = jest.spyOn(console, "error").mockImplementation();
    warnSpy = jest.spyOn(console, "warn").mockImplementation();
  });
  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
  return std;
}
