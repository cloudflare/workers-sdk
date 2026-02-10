import { beforeEach, test } from "vitest";
import { mapRequestToAsset } from "../src/index";
import { mockGlobalScope, mockRequestScope } from "./mocks";

beforeEach(() => {
	mockGlobalScope();
	mockRequestScope();
});

test("mapRequestToAsset() correctly changes /about -> /about/index.html", async ({
	expect,
}) => {
	const path = "/about";
	const request = new Request(`https://foo.com${path}`);
	const newRequest = mapRequestToAsset(request);
	expect(newRequest.url).toBe(request.url + "/index.html");
});

test("mapRequestToAsset() correctly changes /about/ -> /about/index.html", async ({
	expect,
}) => {
	const path = "/about/";
	const request = new Request(`https://foo.com${path}`);
	const newRequest = mapRequestToAsset(request);
	expect(newRequest.url).toBe(request.url + "index.html");
});

test("mapRequestToAsset() correctly changes /about.me/ -> /about.me/index.html", async ({
	expect,
}) => {
	const path = "/about.me/";
	const request = new Request(`https://foo.com${path}`);
	const newRequest = mapRequestToAsset(request);
	expect(newRequest.url).toBe(request.url + "index.html");
});

test("mapRequestToAsset() correctly changes /about -> /about/default.html", async ({
	expect,
}) => {
	const path = "/about";
	const request = new Request(`https://foo.com${path}`);
	const newRequest = mapRequestToAsset(request, {
		defaultDocument: "default.html",
	});
	expect(newRequest.url).toBe(request.url + "/default.html");
});
