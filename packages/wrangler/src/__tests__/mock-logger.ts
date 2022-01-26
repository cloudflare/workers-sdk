/**
 * We use this module to mock logger methods, and optionally
 * assert on the values they're called with in our tests.
 */

import { logger } from "../logger";

let logSpy: jest.SpyInstance,
  errorSpy: jest.SpyInstance,
  warnSpy: jest.SpyInstance,
  columnsSpy: jest.SpyInstance;

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

export function mockLogger({ columns = 500 }: { columns?: number } = {}) {
  beforeEach(() => {
    logSpy = jest.spyOn(logger, "log").mockImplementation();
    errorSpy = jest.spyOn(logger, "error").mockImplementation();
    warnSpy = jest.spyOn(logger, "warn").mockImplementation();
    if (columns) {
      columnsSpy = jest
        .spyOn(logger, "columns", "get")
        .mockReturnValue(columns);
    }
  });
  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    columnsSpy?.mockRestore();
  });
  return std;
}
