import { Request as UndiciRequest } from "undici";
import { Request } from "miniflare";
import { test } from "vitest";

test("Request: clone: returns correctly typed value", async ({ expect }) => {
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

test("Request: accepts Node global Request (cross-brand)", async ({
	expect,
}) => {
	// Miniflare's Request extends undici's Request. Node's global Request is a
	// different brand, so undici would otherwise stringify it to
	// "[object Request]" and fail URL parsing (workers-sdk#15086).
	expect(globalThis.Request).not.toBe(Request);
	expect(globalThis.Request).not.toBe(UndiciRequest);

	const globalRequest = new globalThis.Request("https://example.com/path", {
		method: "POST",
		headers: { "X-Test": "1", "Content-Type": "text/plain" },
		body: "hello",
	});
	expect(globalRequest).not.toBeInstanceOf(Request);
	expect(globalRequest).not.toBeInstanceOf(UndiciRequest);

	const request = new Request(globalRequest);
	expect(request).toBeInstanceOf(Request);
	expect(request.url).toBe("https://example.com/path");
	expect(request.method).toBe("POST");
	expect(request.headers.get("X-Test")).toBe("1");
	expect(await request.text()).toBe("hello");
});

test("Request: global Request with init overrides", async ({ expect }) => {
	const globalRequest = new globalThis.Request("https://example.com/", {
		method: "GET",
		headers: { "X-Original": "yes" },
	});

	const request = new Request(globalRequest, {
		method: "PUT",
		headers: { "X-Override": "1" },
		cf: { cacheKey: "k" },
	});
	expect(request.method).toBe("PUT");
	expect(request.headers.get("X-Override")).toBe("1");
	expect(request.cf).toEqual({ cacheKey: "k" });
});
