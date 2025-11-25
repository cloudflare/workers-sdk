// noinspection HttpUrlsUsage

import { URL } from "node:url";
import test from "ava";
import { matchRoutes, parseRoutes, RouterError } from "miniflare";

// See https://developers.cloudflare.com/workers/platform/routes#matching-behavior and
// https://developers.cloudflare.com/workers/platform/known-issues#route-specificity

test("throws if route contains query string", (t) => {
	t.throws(() => parseRoutes(new Map([["a", ["example.com/?foo=*"]]])), {
		instanceOf: RouterError,
		code: "ERR_QUERY_STRING",
		message:
			'Route "example.com/?foo=*" for "a" contains a query string. This is not allowed.',
	});
});
test("throws if route contains infix wildcards", (t) => {
	t.throws(() => parseRoutes(new Map([["a", ["example.com/*.jpg"]]])), {
		instanceOf: RouterError,
		code: "ERR_INFIX_WILDCARD",
		message:
			'Route "example.com/*.jpg" for "a" contains an infix wildcard. This is not allowed.',
	});
});
test("routes may begin with http:// or https://", (t) => {
	let routes = parseRoutes(new Map([["a", ["example.com/*"]]]));
	t.is(matchRoutes(routes, new URL("http://example.com/foo.jpg")), "a");
	t.is(matchRoutes(routes, new URL("https://example.com/foo.jpg")), "a");
	t.is(matchRoutes(routes, new URL("ftp://example.com/foo.jpg")), "a");

	routes = parseRoutes(
		new Map([
			["a", ["http://example.com/*"]],
			["b", ["https://example.com/*"]],
		])
	);
	t.is(matchRoutes(routes, new URL("http://example.com/foo.jpg")), "a");
	t.is(matchRoutes(routes, new URL("https://example.com/foo.jpg")), "b");
	t.is(matchRoutes(routes, new URL("ftp://example.com/foo.jpg")), null);
});
test("trailing slash automatically implied", (t) => {
	const routes = parseRoutes(new Map([["a", ["example.com"]]]));
	t.is(matchRoutes(routes, new URL("http://example.com/")), "a");
	t.is(matchRoutes(routes, new URL("https://example.com/")), "a");
});
test("route hostnames may begin with *", (t) => {
	let routes = parseRoutes(new Map([["a", ["*example.com/"]]]));
	t.is(matchRoutes(routes, new URL("https://example.com/")), "a");
	t.is(matchRoutes(routes, new URL("https://www.example.com/")), "a");

	routes = parseRoutes(new Map([["a", ["*.example.com/"]]]));
	t.is(matchRoutes(routes, new URL("https://example.com/")), null);
	t.is(matchRoutes(routes, new URL("https://www.example.com/")), "a");
});
test("correctly handles internationalised domain names beginning with *", (t) => {
	// https://github.com/cloudflare/miniflare/issues/186
	let routes = parseRoutes(new Map([["a", ["*glöd.se/*"]]]));
	t.is(matchRoutes(routes, new URL("https://glöd.se/*")), "a");
	t.is(matchRoutes(routes, new URL("https://www.glöd.se/*")), "a");

	routes = parseRoutes(new Map([["a", ["*.glöd.se/*"]]]));
	t.is(matchRoutes(routes, new URL("https://glöd.se/*")), null);
	t.is(matchRoutes(routes, new URL("https://www.glöd.se/*")), "a");
});
test("route paths may end with *", (t) => {
	const routes = parseRoutes(new Map([["a", ["https://example.com/path*"]]]));
	t.is(matchRoutes(routes, new URL("https://example.com/path")), "a");
	t.is(matchRoutes(routes, new URL("https://example.com/path2")), "a");
	t.is(
		matchRoutes(routes, new URL("https://example.com/path/readme.txt")),
		"a"
	);
	t.is(matchRoutes(routes, new URL("https://example.com/notpath")), null);
});
test("matches most specific route", (t) => {
	let routes = parseRoutes(
		new Map([
			["a", ["www.example.com/*"]],
			["b", ["*.example.com/*"]],
		])
	);
	t.is(matchRoutes(routes, new URL("https://www.example.com/")), "a");

	routes = parseRoutes(
		new Map([
			["a", ["example.com/*"]],
			["b", ["example.com/hello/*"]],
		])
	);
	t.is(matchRoutes(routes, new URL("https://example.com/hello/world")), "b");

	routes = parseRoutes(
		new Map([
			["a", ["example.com/*"]],
			["b", ["https://example.com/*"]],
		])
	);
	t.is(matchRoutes(routes, new URL("https://example.com/hello")), "b");

	routes = parseRoutes(
		new Map([
			["a", ["example.com/pa*"]],
			["b", ["example.com/path*"]],
		])
	);
	t.is(matchRoutes(routes, new URL("https://example.com/p")), null);
	t.is(matchRoutes(routes, new URL("https://example.com/pa")), "a");
	t.is(matchRoutes(routes, new URL("https://example.com/pat")), "a");
	t.is(matchRoutes(routes, new URL("https://example.com/path")), "b");
});
test("matches query params", (t) => {
	const routes = parseRoutes(new Map([["a", ["example.com/hello/*"]]]));
	t.is(
		matchRoutes(routes, new URL("https://example.com/hello/world?foo=bar")),
		"a"
	);
});
test("routes are case-sensitive", (t) => {
	const routes = parseRoutes(
		new Map([
			["a", ["example.com/images/*"]],
			["b", ["example.com/Images/*"]],
		])
	);
	t.is(matchRoutes(routes, new URL("https://example.com/images/foo.jpg")), "a");
	t.is(matchRoutes(routes, new URL("https://example.com/Images/foo.jpg")), "b");
});
test("escapes regexp control characters", (t) => {
	const routes = parseRoutes(new Map([["a", ["example.com/*"]]]));
	t.is(matchRoutes(routes, new URL("https://example.com/")), "a");
	t.is(matchRoutes(routes, new URL("https://example2com/")), null);
});
test('"correctly" handles routes with trailing /*', (t) => {
	const routes = parseRoutes(
		new Map([
			["a", ["example.com/images/*"]],
			["b", ["example.com/images*"]],
		])
	);
	t.is(matchRoutes(routes, new URL("https://example.com/images")), "b");
	t.is(matchRoutes(routes, new URL("https://example.com/images123")), "b");
	t.is(matchRoutes(routes, new URL("https://example.com/images/hello")), "b"); // unexpected
});
test("returns null if no routes match", (t) => {
	const routes = parseRoutes(new Map([["a", ["example.com/*"]]]));
	t.is(matchRoutes(routes, new URL("https://miniflare.dev/")), null);
});
test("matches everything route", (t) => {
	const routes = parseRoutes(new Map([["a", ["*/*"]]]));
	t.is(matchRoutes(routes, new URL("http://example.com/")), "a");
	t.is(matchRoutes(routes, new URL("https://example.com/")), "a");
	t.is(matchRoutes(routes, new URL("https://miniflare.dev/")), "a");
});
