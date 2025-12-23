import { Request } from "miniflare";
import { expect, test } from "vitest";

test("Request: clone: returns correctly typed value", async () => {
	const request = new Request("http://localhost/", {
		method: "POST",
		body: "text",
		cf: { cacheKey: "key" },
	});

	const clone1 = request.clone();
	const clone2 = clone1.clone(); // Test cloning a clone

	expect(clone1).toBeInstanceOf(Request);
	expect(clone2).toBeInstanceOf(Request);
	expect(request.method).toBe("POST");
	expect(clone1.method).toBe("POST");
	expect(clone2.method).toBe("POST");
	expect(await request.text()).toBe("text");
	expect(await clone1.text()).toBe("text");
	expect(await clone2.text()).toBe("text");
});
