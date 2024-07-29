import test from "ava";
import { mapRequestToAsset } from "../index";
import { mockGlobalScope, mockRequestScope } from "../mocks";

mockGlobalScope();

test("mapRequestToAsset() correctly changes /about -> /about/index.html", async (t) => {
	mockRequestScope();
	const path = "/about";
	const request = new Request(`https://foo.com${path}`);
	const newRequest = mapRequestToAsset(request);
	t.is(newRequest.url, request.url + "/index.html");
});

test("mapRequestToAsset() correctly changes /about/ -> /about/index.html", async (t) => {
	mockRequestScope();
	const path = "/about/";
	const request = new Request(`https://foo.com${path}`);
	const newRequest = mapRequestToAsset(request);
	t.is(newRequest.url, request.url + "index.html");
});

test("mapRequestToAsset() correctly changes /about.me/ -> /about.me/index.html", async (t) => {
	mockRequestScope();
	const path = "/about.me/";
	const request = new Request(`https://foo.com${path}`);
	const newRequest = mapRequestToAsset(request);
	t.is(newRequest.url, request.url + "index.html");
});

test("mapRequestToAsset() correctly changes /about -> /about/default.html", async (t) => {
	mockRequestScope();
	const path = "/about";
	const request = new Request(`https://foo.com${path}`);
	const newRequest = mapRequestToAsset(request, {
		defaultDocument: "default.html",
	});
	t.is(newRequest.url, request.url + "/default.html");
});
