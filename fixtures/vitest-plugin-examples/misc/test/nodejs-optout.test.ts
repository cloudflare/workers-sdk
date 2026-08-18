import { it } from "vitest";

// The project sets `no_nodejs_compat_v2` on a compatibility date that enables
// Node.js compatibility on its own. The pool requires v2 for the runner, so it
// drops that opt-out — and must not add `nodejs_compat_v2` back, since the date
// already enables it and workerd rejects a flag it enables by default.
it("runs the tests even though the project opts out of nodejs_compat_v2", ({
	expect,
}) => {
	expect(typeof process).toBe("object");
	expect(process.versions.node).toBeDefined();
	expect(typeof Buffer).toBe("function");
});
