import { _isCyclic } from "miniflare";
import { expect, test } from "vitest";

test("_isCyclic: detects cycles", () => {
	// Check simple cycle
	const a: { a?: unknown } = {};
	a.a = a;
	expect(_isCyclic(a)).toBe(true);

	// Check simple array cycle
	const b: unknown[] = [];
	b.push(b);
	expect(_isCyclic(b)).toBe(true);

	// Check duplicated, but not cyclic values
	const c = {};
	const d = [c, c];
	expect(_isCyclic(c)).toBe(false);
	expect(_isCyclic(d)).toBe(false);

	// Check long cycle
	const e = { f: { g: {}, h: { i: {} } } };
	e.f.h.i = e.f;
	expect(_isCyclic(e)).toBe(true);
});
