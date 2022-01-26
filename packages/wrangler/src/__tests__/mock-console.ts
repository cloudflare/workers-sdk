/**
 * We use this module to mock console methods, and optionally
 * assert on the values they're called with in our tests.
 */

let logSpy: jest.SpyInstance,
  errorSpy: jest.SpyInstance,
  warnSpy: jest.SpyInstance;

// Store the actual current number of columns, because we will override this when mocking the console.
const originalColumns = process.stdout.columns;

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

/**
 * Mock out the console.xxx methods, capturing their calls via spies.
 *
 * The spies can be accessed via the returned object.
 * Set the `columns` argument to ensure that Ink components are rendered in a suitably wide format.
 */
export function mockConsoleMethods({
  columns = 500,
}: { columns?: number } = {}) {
  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation();
    errorSpy = jest.spyOn(console, "error").mockImplementation();
    warnSpy = jest.spyOn(console, "warn").mockImplementation();
    process.stdout.columns = columns;
  });
  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    process.stdout.columns = originalColumns;
  });
  return std;
}
