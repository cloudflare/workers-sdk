import assert from "node:assert";
import { setTimeout } from "node:timers/promises";
import { Awaitable } from "miniflare";
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

export async function flaky(
	impl: () => Awaitable<void>,
	maxAttempts: number = 3
): Promise<void> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			await impl();
			return;
		} catch (e) {
			lastError = e;
			if (attempt < maxAttempts) {
				// eslint-disable-next-line no-console
				console.log(`Attempt #${attempt} failed!`);
				// eslint-disable-next-line no-console
				console.log(e);
			}
		}
	}
	throw lastError;
}

/**
 * Wait for the callback to execute successfully. If the callback throws an error or returns a rejected promise it will continue to wait until it succeeds or times out.
 */
export async function waitFor<T>(
	callback: () => T | Promise<T>,
	timeout = 5000
): Promise<T> {
	const start = Date.now();
	while (true) {
		try {
			return callback();
		} catch (error) {
			if (Date.now() < start + timeout) {
				throw error;
			}
		}
		await setTimeout(100);
	}
}

export async function waitUntil(
	impl: () => Awaitable<void>,
	timeout: number = 10000
): Promise<void> {
	const start = Date.now();
	let lastError: unknown;

	while (true) {
		try {
			await impl();
			return;
		} catch (e) {
			lastError = e;
			if (Date.now() - start > timeout) {
				throw lastError;
			}
		}
		await setTimeout(100);
	}
}
