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
