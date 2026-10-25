import { test } from "vitest";
import { installIndirectEval } from "../eval-binding";

test("delegates strings to the local development evaluator", ({ expect }) => {
	const original = globalThis.eval;
	const calls: string[] = [];
	try {
		installIndirectEval((source) => {
			calls.push(source);
			return original(source);
		});
		expect(globalThis.eval("40 + 2")).toBe(42);
		expect(globalThis.eval("(function FlightStack() {})").name).toBe(
			"FlightStack"
		);
		expect(calls).toEqual(["40 + 2", "(function FlightStack() {})"]);
	} finally {
		globalThis.eval = original;
	}
});

test("returns non-string inputs unchanged without evaluating them", ({
	expect,
}) => {
	const original = globalThis.eval;
	let calls = 0;
	try {
		installIndirectEval(() => {
			calls++;
		});
		const evaluate = globalThis.eval as (value: unknown) => unknown;
		for (const value of [undefined, null, 1, true, {}, new String("40 + 2")]) {
			expect(evaluate(value)).toBe(value);
		}
		expect(calls).toBe(0);
	} finally {
		globalThis.eval = original;
	}
});

test("preserves syntax and runtime errors from the evaluator", ({ expect }) => {
	const original = globalThis.eval;
	try {
		installIndirectEval((source) => original(source));
		expect(() => globalThis.eval("(")).toThrow(SyntaxError);
		expect(() =>
			globalThis.eval('throw new Error("development error")')
		).toThrow("development error");
	} finally {
		globalThis.eval = original;
	}
});
