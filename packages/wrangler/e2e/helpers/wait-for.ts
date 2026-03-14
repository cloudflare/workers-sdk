import { vi } from "vitest";

type WaitForOptions = { interval?: number; timeout?: number };

/**
 * Wrapper around `vi.waitFor()` for polling synchronous state (e.g. `currentOutput`).
 * Defaults to `{ interval: 100, timeout: 5_000 }`.
 */
export function waitFor<T>(
	callback: () => T | Promise<T>,
	options?: WaitForOptions
): Promise<T> {
	return vi.waitFor(callback, {
		interval: 100,
		timeout: 5_000,
		...options,
	});
}

/**
 * Wrapper around `vi.waitFor()` for polling HTTP endpoints (e.g. `fetch`/`fetchText`).
 * Uses a slower poll interval and longer timeout than `waitFor`.
 * Defaults to `{ interval: 500, timeout: 10_000 }`.
 */
export function waitForFetch<T>(
	callback: () => T | Promise<T>,
	options?: WaitForOptions
): Promise<T> {
	return vi.waitFor(callback, {
		interval: 500,
		timeout: 10_000,
		...options,
	});
}
