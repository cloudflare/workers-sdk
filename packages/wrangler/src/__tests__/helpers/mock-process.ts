/**
 * We use this module to mock process methods (write only for now),
 * and optionally assert on the values they're called with in our tests.
 */

let writeSpy: jest.SpyInstance;

function captureWriteCall(spy: jest.SpyInstance): Buffer {
  return spy.mock.calls[0]?.[0] ?? Buffer.alloc(0);
}

export function mockProcess() {
  beforeEach(() => {
    writeSpy = jest.spyOn(process.stdout, "write").mockImplementation();
  });
  afterEach(() => {
    writeSpy.mockRestore();
  });
  return {
    get write() {
      return captureWriteCall(writeSpy);
    },
  };
}
