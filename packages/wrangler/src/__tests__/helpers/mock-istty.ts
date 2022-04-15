const ORIGINAL_ISTTY = process.stdout.isTTY;

/**
 * Mock `process.stdout.isTTY`
 */
export function useMockIsTTY() {
  /**
   * Explicitly set `process.stdout.isTTY` to a given value
   */
  const setIsTTY = (isTTY: boolean) => {
    process.stdout.isTTY = isTTY;
  };

  beforeEach(() => {
    process.stdout.isTTY = ORIGINAL_ISTTY;
  });

  afterEach(() => {
    process.stdout.isTTY = ORIGINAL_ISTTY;
  });

  return { setIsTTY };
}
