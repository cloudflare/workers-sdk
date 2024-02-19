import test from "ava";
import { _isCyclic } from "miniflare";

test("_isCyclic: detects cycles", (t) => {
	// Check simple cycle
	const a: { a?: unknown } = {};
	a.a = a;
	t.true(_isCyclic(a));

	// Check simple array cycle
	const b: unknown[] = [];
	b.push(b);
	t.true(_isCyclic(b));

	// Check duplicated, but not cyclic values
	const c = {};
	const d = [c, c];
	t.false(_isCyclic(c));
	t.false(_isCyclic(d));

	// Check long cycle
	const e = { f: { g: {}, h: { i: {} } } };
	e.f.h.i = e.f;
	t.true(_isCyclic(e));
});
