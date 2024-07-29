/**
 * This file simply re-exports the process's writeable streams
 * The intention is to provide a boundary to mock in tests
 * Anywhere in this package that writes to stdout/stderr,
 * should use this module to get references to them.
 */

export const stdout = process.stdout;
export const stderr = process.stderr;
