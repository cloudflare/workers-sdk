import { vi } from "vitest";
import type { AutoConfigContext } from "../../src/context";

/**
 * Creates a mock `AutoConfigContext` suitable for testing.
 * All dialog methods default to returning sensible values.
 * The logger delegates to `console` so that `mockConsoleMethods()` captures
 * the output and tests can assert on `std.out`, `std.warn`, etc.
 *
 * @param overrides - Partial overrides to customize the context.
 * @returns A fully mocked `AutoConfigContext`.
 */
export function createMockContext(
	overrides?: Partial<AutoConfigContext>
): AutoConfigContext {
	return {
		logger: {
			log: vi.fn((...args: unknown[]) => console.log(...args)),
			info: vi.fn((...args: unknown[]) => console.info(...args)),
			warn: vi.fn((...args: unknown[]) => console.warn(...args)),
			debug: vi.fn((...args: unknown[]) => console.debug(...args)),
			error: vi.fn((...args: unknown[]) => console.error(...args)),
		},
		dialogs: {
			confirm: vi.fn().mockResolvedValue(true),
			prompt: vi.fn().mockResolvedValue(""),
			select: vi.fn().mockResolvedValue(""),
		},
		runCommand: vi.fn(),
		isNonInteractiveOrCI: () => false,
		getCacheFolder: () => undefined,
		...overrides,
	};
}
