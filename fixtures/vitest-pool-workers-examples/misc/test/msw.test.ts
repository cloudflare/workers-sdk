import { http, HttpResponse } from "msw";
import { expect, it } from "vitest";
import { server } from "./server";

it("falls through to global fetch() if unmatched", async () => {
	server.use(
		http.get(
			"https://example.com",
			() => {
				return HttpResponse.text("body");
			},
			{ once: true }
		)
	);

	let response = await fetch("https://example.com");
	expect(response.url).toEqual("https://example.com/");
	expect(await response.text()).toBe("body");

	response = await fetch("https://example.com/bad");
	expect(response.url).toEqual("https://example.com/bad");
	expect(await response.text()).toBe("fallthrough:GET https://example.com/bad");
});

it("intercepts URLs with query parameters with repeated keys", async () => {
	server.use(
		http.get(
			"https://example.com/foo?key=value",
			() => {
				return HttpResponse.text("foo");
			},
			{ once: true }
		),
		http.get(
			"https://example.com/bar?a=1&a=2",
			() => {
				return HttpResponse.text("bar");
			},
			{ once: true }
		),
		http.get(
			"https://example.com/baz?key1=a&key2=c&key1=b",
			() => {
				return HttpResponse.text("baz");
			},
			{ once: true }
		)
	);

	let response1 = await fetch("https://example.com/foo?key=value");
	expect(response1.url).toEqual("https://example.com/foo?key=value");
	expect(await response1.text()).toBe("foo");

	let response2 = await fetch("https://example.com/bar?a=1&a=2");
	expect(response2.url).toEqual("https://example.com/bar?a=1&a=2");
	expect(await response2.text()).toBe("bar");

	let response3 = await fetch("https://example.com/baz?key1=a&key2=c&key1=b");
	expect(response3.url).toEqual("https://example.com/baz?key1=a&key2=c&key1=b");
	expect(await response3.text()).toBe("baz");
});
