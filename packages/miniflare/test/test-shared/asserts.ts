import assert from "node:assert";
import { expect } from "vitest";

/**
 * Type for error expectations in tests (similar to Ava's ThrowsExpectation)
 */
export interface ThrowsExpectation<T extends Error = Error> {
	instanceOf?: new (...args: any[]) => T;
	message?: string | RegExp;
	name?: string;
	code?: string;
}

export function isWithin(
	epsilon: number,
	actual?: number,
	expected?: number
): void {
	expect(actual).not.toBeUndefined();
	expect(expected).not.toBeUndefined();
	assert(actual !== undefined && expected !== undefined);
	const difference = Math.abs(actual - expected);
	expect(difference).toBeLessThanOrEqual(epsilon);
}

export function escapeRegexpComponent(value: string): string {
	// From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#escaping
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
