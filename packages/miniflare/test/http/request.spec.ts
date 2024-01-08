import test from "ava";
import { Request } from "miniflare";

test("Request: clone: returns correctly typed value", async (t) => {
	const request = new Request("http://localhost/", {
		method: "POST",
		body: "text",
		cf: { cacheKey: "key" },
	});

	const clone1 = request.clone();
	const clone2 = clone1.clone(); // Test cloning a clone

	// noinspection SuspiciousTypeOfGuard
	t.true(clone1 instanceof Request);
	// noinspection SuspiciousTypeOfGuard
	t.true(clone2 instanceof Request);
	t.is(request.method, "POST");
	t.is(clone1.method, "POST");
	t.is(clone2.method, "POST");
	t.is(await request.text(), "text");
	t.is(await clone1.text(), "text");
	t.is(await clone2.text(), "text");
});
