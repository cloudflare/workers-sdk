/**
 * We use this module to mock process methods (write only for now),
 * and optionally assert on the values they're called with in our tests.
 */

let writeSpy: jest.SpyInstance;

function captureLastWriteCall(spy: jest.SpyInstance): Buffer {
  const buffer = spy.mock.calls.pop()?.pop() ?? Buffer.alloc(0);
  if (buffer instanceof Buffer) {
    return buffer;
  } else {
    throw new Error(
      `Unexpected value passed to process.stdout.write(): "${buffer}"`
    );
  }
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
      return captureLastWriteCall(writeSpy);
    },
  };
}
