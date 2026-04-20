import { beforeEach, test } from "vitest";
import { serveSinglePageApp } from "../src/index";
import { mockGlobalScope, mockRequestScope } from "./mocks";

beforeEach(() => {
	mockGlobalScope();
	mockRequestScope();
});

function testRequest(path: string) {
	const url = new URL("https://example.com");
	url.pathname = path;
	const request = new Request(url.toString());

	return request;
}

test("serveSinglePageApp returns root asset path when request path ends in .html", async ({
	expect,
}) => {
	const path = "/foo/thing.html";
	const request = testRequest(path);

	const expected_request = testRequest("/index.html");
	const actual_request = serveSinglePageApp(request);

	expect(expected_request.url).toEqual(actual_request.url);
});

test("serveSinglePageApp returns root asset path when request path does not have extension", async ({
	expect,
}) => {
	const path = "/foo/thing";
	const request = testRequest(path);

	const expected_request = testRequest("/index.html");
	const actual_request = serveSinglePageApp(request);

	expect(expected_request.url).toEqual(actual_request.url);
});

test("serveSinglePageApp returns requested asset when request path has non-html extension", async ({
	expect,
}) => {
	const path = "/foo/thing.js";
	const request = testRequest(path);

	const expected_request = request;
	const actual_request = serveSinglePageApp(request);

	expect(expected_request.url).toEqual(actual_request.url);
});
