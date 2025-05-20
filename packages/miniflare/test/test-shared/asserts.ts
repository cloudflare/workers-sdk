import assert from "assert";
import { ExecutionContext } from "ava";
import { Awaitable } from "miniflare";

export function isWithin(
	t: ExecutionContext,
	epsilon: number,
	actual?: number,
	expected?: number
): void {
	t.not(actual, undefined);
	t.not(expected, undefined);
	assert(actual !== undefined && expected !== undefined);
	const difference = Math.abs(actual - expected);
	t.true(
		difference <= epsilon,
		`${actual} is not within ${epsilon} of ${expected}, difference is ${difference}`
	);
}

export function escapeRegexpComponent(value: string): string {
	// From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#escaping
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function flaky(
	impl: (t: ExecutionContext) => Awaitable<void>
): (t: ExecutionContext) => Promise<void> {
	const maxAttempts = 3;
	return async (t) => {
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			const result = await t.try(impl);
			if (result.passed || attempt === maxAttempts) {
				result.commit();
				return;
			} else {
				result.discard();
				t.log(`Attempt #${attempt} failed!`);
				t.log(...result.errors);
			}
		}
	};
}

export function waitUntil(
	t: ExecutionContext,
	impl: (t: ExecutionContext) => Awaitable<void>,
	timeout: number = 5000,
	delay: number = 200
): Promise<void> {
	return new Promise((resolve, reject) => {
		const start = Date.now();
		const interval = setInterval(async () => {
			try {
				const result = await t.try(impl);

				if (result.passed || Date.now() - start > timeout) {
					clearInterval(interval);
					try {
						result.commit();
						resolve();
					} catch (ex) {
						reject(ex);
					}
					return;
				}

				result.discard();
			} catch {
				// Ignore errors and keep waiting
			}
		}, delay);
	});
}
