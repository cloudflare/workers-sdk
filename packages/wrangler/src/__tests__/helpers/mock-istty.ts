const ORIGINAL_STDOUT_ISTTY = process.stdout.isTTY;
const ORIGINAL_STDIN_ISTTY = process.stdin.isTTY;

/**
 * Mock `process.stdout.isTTY`
 */
export function useMockIsTTY() {
  /**
   * Explicitly set `process.stdout.isTTY` to a given value
   */
  const setIsTTY = (isTTY: boolean | { stdin: boolean; stdout: boolean }) => {
    if (typeof isTTY === "boolean") {
      process.stdout.isTTY = isTTY;
      process.stdin.isTTY = isTTY;
    } else {
      process.stdin.isTTY = isTTY.stdin;
      process.stdout.isTTY = isTTY.stdout;
    }
  };

  beforeEach(() => {
    process.stdout.isTTY = ORIGINAL_STDOUT_ISTTY;
    process.stdin.isTTY = ORIGINAL_STDIN_ISTTY;
  });

  afterEach(() => {
    process.stdout.isTTY = ORIGINAL_STDOUT_ISTTY;
    process.stdin.isTTY = ORIGINAL_STDIN_ISTTY;
  });

  return { setIsTTY };
}
