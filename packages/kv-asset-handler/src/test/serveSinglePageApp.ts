import test from "ava";
import { serveSinglePageApp } from "../index";
import { mockGlobalScope, mockRequestScope } from "../mocks";
import type { ExecutionContext } from "ava";

mockGlobalScope();

function looseMatchRequest(t: ExecutionContext, a: Request, b: Request) {
	return t.deepEqual(
		{
			body: a.body,
			cache: a.cache,
			credentials: a.credentials,
			headers: a.headers,
			method: a.method,
			url: a.url,
		},
		{
			body: b.body,
			cache: b.cache,
			credentials: b.credentials,
			headers: b.headers,
			method: b.method,
			url: b.url,
		}
	);
}

function testRequest(path: string) {
	mockRequestScope();
	const url = new URL("https://example.com");
	url.pathname = path;
	const request = new Request(url.toString());

	return request;
}

test("serveSinglePageApp returns root asset path when request path ends in .html", async (t) => {
	const path = "/foo/thing.html";
	const request = testRequest(path);

	const expected_request = testRequest("/index.html");
	const actual_request = serveSinglePageApp(request);

	looseMatchRequest(t, expected_request, actual_request);
});

test("serveSinglePageApp returns root asset path when request path does not have extension", async (t) => {
	const path = "/foo/thing";
	const request = testRequest(path);

	const expected_request = testRequest("/index.html");
	const actual_request = serveSinglePageApp(request);

	looseMatchRequest(t, expected_request, actual_request);
});

test("serveSinglePageApp returns requested asset when request path has non-html extension", async (t) => {
	const path = "/foo/thing.js";
	const request = testRequest(path);

	const expected_request = request;
	const actual_request = serveSinglePageApp(request);

	looseMatchRequest(t, expected_request, actual_request);
});
