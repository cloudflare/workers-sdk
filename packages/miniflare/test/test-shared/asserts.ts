import assert from "assert";
import { ExecutionContext } from "ava";

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

export function escapeRegexp(value: string): RegExp {
	// From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#escaping
	return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}
