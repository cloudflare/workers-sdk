import { Response, WebSocketPair } from "miniflare";
import { expect, test } from "vitest";

test("Response: static methods return correctly typed values", async () => {
	const error = Response.error();
	// noinspection SuspiciousTypeOfGuard
	expect(error).toBeInstanceOf(Response);

	const redirect = Response.redirect("http://localhost/", 302);
	// noinspection SuspiciousTypeOfGuard
	expect(redirect).toBeInstanceOf(Response);
	expect(redirect.status).toBe(302);
	expect(redirect.headers.get("Location")).toBe("http://localhost/");

	const json = Response.json({ testing: true }, { status: 404 });
	// noinspection SuspiciousTypeOfGuard
	expect(json).toBeInstanceOf(Response);
	expect(json.status).toBe(404);
	expect(json.headers.get("Content-Type")).toBe("application/json");
	expect(await json.json()).toEqual({ testing: true });
});

test("Response: requires status 101 for WebSocket handshakes response", () => {
	const pair = new WebSocketPair();
	expect(() => new Response(null, { webSocket: pair["0"] })).toThrow(
		"Responses with a WebSocket must have status code 101."
	);
});
test("Response: only allows status 101 for WebSocket response", () => {
	expect(() => new Response(null, { status: 101 })).toThrow(
		'init["status"] must be in the range of 200 to 599, inclusive.'
	);
});

test("Response: clone: returns correctly typed value", async () => {
	const response = new Response("text");
	const clone1 = response.clone();
	const clone2 = clone1.clone(); // Test cloning a clone

	// noinspection SuspiciousTypeOfGuard
	expect(clone1).toBeInstanceOf(Response);
	// noinspection SuspiciousTypeOfGuard
	expect(clone2).toBeInstanceOf(Response);
	expect(await response.text()).toBe("text");
	expect(await clone1.text()).toBe("text");
	expect(await clone2.text()).toBe("text");
});
test("Response: clone: fails on WebSocket handshake response", () => {
	const pair = new WebSocketPair();
	const res = new Response(null, {
		status: 101,
		webSocket: pair["0"],
	});
	expect(() => res.clone()).toThrow(
		"Cannot clone a response to a WebSocket handshake."
	);
});
