// noinspection HttpUrlsUsage

import { URL } from "node:url";
import { matchRoutes, parseRoutes, RouterError } from "miniflare";
import { expect, test } from "vitest";

// See https://developers.cloudflare.com/workers/platform/routes#matching-behavior and
// https://developers.cloudflare.com/workers/platform/known-issues#route-specificity

test("throws if route contains query string", () => {
	expect(() => parseRoutes(new Map([["a", ["example.com/?foo=*"]]]))).toThrow(
		new RouterError(
			"ERR_QUERY_STRING",
			'Route "example.com/?foo=*" for "a" contains a query string. This is not allowed.'
		)
	);
});
test("throws if route contains infix wildcards", () => {
	expect(() => parseRoutes(new Map([["a", ["example.com/*.jpg"]]]))).toThrow(
		new RouterError(
			"ERR_INFIX_WILDCARD",
			'Route "example.com/*.jpg" for "a" contains an infix wildcard. This is not allowed.'
		)
	);
});
test("routes may begin with http:// or https://", () => {
	let routes = parseRoutes(new Map([["a", ["example.com/*"]]]));
	expect(matchRoutes(routes, new URL("http://example.com/foo.jpg"))).toBe("a");
	expect(matchRoutes(routes, new URL("https://example.com/foo.jpg"))).toBe("a");
	expect(matchRoutes(routes, new URL("ftp://example.com/foo.jpg"))).toBe("a");

	routes = parseRoutes(
		new Map([
			["a", ["http://example.com/*"]],
			["b", ["https://example.com/*"]],
		])
	);
	expect(matchRoutes(routes, new URL("http://example.com/foo.jpg"))).toBe("a");
	expect(matchRoutes(routes, new URL("https://example.com/foo.jpg"))).toBe("b");
	expect(matchRoutes(routes, new URL("ftp://example.com/foo.jpg"))).toBe(null);
});
test("trailing slash automatically implied", () => {
	const routes = parseRoutes(new Map([["a", ["example.com"]]]));
	expect(matchRoutes(routes, new URL("http://example.com/"))).toBe("a");
	expect(matchRoutes(routes, new URL("https://example.com/"))).toBe("a");
});
test("route hostnames may begin with *", () => {
	let routes = parseRoutes(new Map([["a", ["*example.com/"]]]));
	expect(matchRoutes(routes, new URL("https://example.com/"))).toBe("a");
	expect(matchRoutes(routes, new URL("https://www.example.com/"))).toBe("a");

	routes = parseRoutes(new Map([["a", ["*.example.com/"]]]));
	expect(matchRoutes(routes, new URL("https://example.com/"))).toBe(null);
	expect(matchRoutes(routes, new URL("https://www.example.com/"))).toBe("a");
});
test("correctly handles internationalised domain names beginning with *", () => {
	// https://github.com/cloudflare/miniflare/issues/186
	let routes = parseRoutes(new Map([["a", ["*glöd.se/*"]]]));
	expect(matchRoutes(routes, new URL("https://glöd.se/*"))).toBe("a");
	expect(matchRoutes(routes, new URL("https://www.glöd.se/*"))).toBe("a");

	routes = parseRoutes(new Map([["a", ["*.glöd.se/*"]]]));
	expect(matchRoutes(routes, new URL("https://glöd.se/*"))).toBe(null);
	expect(matchRoutes(routes, new URL("https://www.glöd.se/*"))).toBe("a");
});
test("route paths may end with *", () => {
	const routes = parseRoutes(new Map([["a", ["https://example.com/path*"]]]));
	expect(matchRoutes(routes, new URL("https://example.com/path"))).toBe("a");
	expect(matchRoutes(routes, new URL("https://example.com/path2"))).toBe("a");
	expect(
		matchRoutes(routes, new URL("https://example.com/path/readme.txt"))
	).toBe("a");
	expect(matchRoutes(routes, new URL("https://example.com/notpath"))).toBe(
		null
	);
});
test("matches most specific route", () => {
	let routes = parseRoutes(
		new Map([
			["a", ["www.example.com/*"]],
			["b", ["*.example.com/*"]],
		])
	);
	expect(matchRoutes(routes, new URL("https://www.example.com/"))).toBe("a");

	routes = parseRoutes(
		new Map([
			["a", ["example.com/*"]],
			["b", ["example.com/hello/*"]],
		])
	);
	expect(matchRoutes(routes, new URL("https://example.com/hello/world"))).toBe(
		"b"
	);

	routes = parseRoutes(
		new Map([
			["a", ["example.com/*"]],
			["b", ["https://example.com/*"]],
		])
	);
	expect(matchRoutes(routes, new URL("https://example.com/hello"))).toBe("b");

	routes = parseRoutes(
		new Map([
			["a", ["example.com/pa*"]],
			["b", ["example.com/path*"]],
		])
	);
	expect(matchRoutes(routes, new URL("https://example.com/p"))).toBe(null);
	expect(matchRoutes(routes, new URL("https://example.com/pa"))).toBe("a");
	expect(matchRoutes(routes, new URL("https://example.com/pat"))).toBe("a");
	expect(matchRoutes(routes, new URL("https://example.com/path"))).toBe("b");
});
test("matches query params", () => {
	const routes = parseRoutes(new Map([["a", ["example.com/hello/*"]]]));
	expect(
		matchRoutes(routes, new URL("https://example.com/hello/world?foo=bar"))
	).toBe("a");
});
test("routes are case-sensitive", () => {
	const routes = parseRoutes(
		new Map([
			["a", ["example.com/images/*"]],
			["b", ["example.com/Images/*"]],
		])
	);
	expect(
		matchRoutes(routes, new URL("https://example.com/images/foo.jpg"))
	).toBe("a");
	expect(
		matchRoutes(routes, new URL("https://example.com/Images/foo.jpg"))
	).toBe("b");
});
test("escapes regexp control characters", () => {
	const routes = parseRoutes(new Map([["a", ["example.com/*"]]]));
	expect(matchRoutes(routes, new URL("https://example.com/"))).toBe("a");
	expect(matchRoutes(routes, new URL("https://example2com/"))).toBe(null);
});
test('"correctly" handles routes with trailing /*', () => {
	const routes = parseRoutes(
		new Map([
			["a", ["example.com/images/*"]],
			["b", ["example.com/images*"]],
		])
	);
	expect(matchRoutes(routes, new URL("https://example.com/images"))).toBe("b");
	expect(matchRoutes(routes, new URL("https://example.com/images123"))).toBe(
		"b"
	);
	expect(matchRoutes(routes, new URL("https://example.com/images/hello"))).toBe(
		"b"
	); // unexpected
});
test("returns null if no routes match", () => {
	const routes = parseRoutes(new Map([["a", ["example.com/*"]]]));
	expect(matchRoutes(routes, new URL("https://miniflare.dev/"))).toBe(null);
});
test("matches everything route", () => {
	const routes = parseRoutes(new Map([["a", ["*/*"]]]));
	expect(matchRoutes(routes, new URL("http://example.com/"))).toBe("a");
	expect(matchRoutes(routes, new URL("https://example.com/"))).toBe("a");
	expect(matchRoutes(routes, new URL("https://miniflare.dev/"))).toBe("a");
});
