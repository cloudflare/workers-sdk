import { expect } from "vitest";

/**
 * Type for error expectations in tests (similar to Ava's ThrowsExpectation)
 */
export interface ThrowsExpectation<T extends Error = Error> {
	instanceOf?: new (...args: any[]) => T;
	message?: string | RegExp | ((message: string) => boolean);
	name?: string;
	code?: string;
}

/**
 * Helper function to assert error properties (similar to Ava's t.throws)
 * Captures the thrown error and asserts on instanceOf, code, and message
 */
export function expectThrows<T extends Error = Error>(
	fn: () => void,
	expectations: ThrowsExpectation<T>
): T {
	let error: Error | undefined;
	try {
		fn();
	} catch (e) {
		error = e as Error;
	}
	expect(error).toBeDefined();
	if (expectations.instanceOf) {
		expect(error).toBeInstanceOf(expectations.instanceOf);
	}
	if (expectations.code !== undefined) {
		expect((error as any).code).toBe(expectations.code);
	}
	if (expectations.message !== undefined) {
		if (typeof expectations.message === "string") {
			expect(error?.message).toBe(expectations.message);
		} else if (expectations.message instanceof RegExp) {
			expect(error?.message).toMatch(expectations.message);
		} else if (typeof expectations.message === "function") {
			expect(expectations.message(error?.message ?? "")).toBe(true);
		}
	}
	return error as T;
}

/**
 * Helper function to assert async error properties (similar to Ava's t.throwsAsync)
 * Captures the thrown error and asserts on instanceOf, code, and message
 */
export async function expectThrowsAsync<T extends Error = Error>(
	fn: () => Promise<unknown> | Promise<void>,
	expectations: ThrowsExpectation<T>
): Promise<T> {
	let error: Error | undefined;
	try {
		await fn();
	} catch (e) {
		error = e as Error;
	}
	expect(error).toBeDefined();
	if (expectations.instanceOf) {
		expect(error).toBeInstanceOf(expectations.instanceOf);
	}
	if (expectations.code !== undefined) {
		expect((error as any).code).toBe(expectations.code);
	}
	if (expectations.message !== undefined) {
		if (typeof expectations.message === "string") {
			expect(error?.message).toBe(expectations.message);
		} else if (expectations.message instanceof RegExp) {
			expect(error?.message).toMatch(expectations.message);
		} else if (typeof expectations.message === "function") {
			expect(expectations.message(error?.message ?? "")).toBe(true);
		}
	}
	return error as T;
}

export function escapeRegexpComponent(value: string): string {
	// From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#escaping
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
