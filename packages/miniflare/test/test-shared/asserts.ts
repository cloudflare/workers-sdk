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
 * Asymmetric matcher for error assertions.
 * Can be used with expect().toThrow() or expect().rejects.toThrow()
 * to check error properties like instanceOf, code, and message.
 *
 * @example
 * expect(() => throwError()).toThrow(errorLike({ code: "ERR_VALIDATION" }));
 * await expect(asyncFn()).rejects.toThrow(errorLike({ message: /invalid/ }));
 */
export function errorLike<T extends Error = Error>(
	expectations: ThrowsExpectation<T>
): {
	asymmetricMatch: (actual: unknown) => boolean;
	toString: () => string;
	toAsymmetricMatcher: () => string;
} {
	return {
		asymmetricMatch(actual: unknown): boolean {
			if (!(actual instanceof Error)) {
				return false;
			}
			if (
				expectations.instanceOf &&
				!(actual instanceof expectations.instanceOf)
			) {
				return false;
			}
			if (expectations.code !== undefined) {
				const errorWithCode = actual as { code?: unknown };
				if (
					typeof errorWithCode.code !== "string" ||
					errorWithCode.code !== expectations.code
				) {
					return false;
				}
			}
			if (expectations.message !== undefined) {
				if (typeof expectations.message === "string") {
					if (actual.message !== expectations.message) {
						return false;
					}
				} else if (expectations.message instanceof RegExp) {
					if (!expectations.message.test(actual.message)) {
						return false;
					}
				} else if (typeof expectations.message === "function") {
					if (!expectations.message(actual.message)) {
						return false;
					}
				}
			}
			if (expectations.name !== undefined) {
				if (actual.name !== expectations.name) {
					return false;
				}
			}
			return true;
		},
		toString(): string {
			return this.toAsymmetricMatcher();
		},
		toAsymmetricMatcher(): string {
			const parts: string[] = [];
			if (expectations.instanceOf) {
				parts.push(`instanceOf: ${expectations.instanceOf.name}`);
			}
			if (expectations.code !== undefined) {
				parts.push(`code: "${expectations.code}"`);
			}
			if (expectations.message !== undefined) {
				if (expectations.message instanceof RegExp) {
					parts.push(`message: ${String(expectations.message)}`);
				} else if (typeof expectations.message === "function") {
					parts.push(`message: [Function]`);
				} else {
					parts.push(`message: "${expectations.message}"`);
				}
			}
			if (expectations.name !== undefined) {
				parts.push(`name: "${expectations.name}"`);
			}
			return `errorLike({ ${parts.join(", ")} })`;
		},
	};
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
