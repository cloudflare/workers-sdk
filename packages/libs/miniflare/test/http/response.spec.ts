import test from "ava";
import { Response, WebSocketPair } from "miniflare";

test("Response: static methods return correctly typed values", async (t) => {
	const error = Response.error();
	// noinspection SuspiciousTypeOfGuard
	t.true(error instanceof Response);

	const redirect = Response.redirect("http://localhost/", 302);
	// noinspection SuspiciousTypeOfGuard
	t.true(redirect instanceof Response);
	t.is(redirect.status, 302);
	t.is(redirect.headers.get("Location"), "http://localhost/");

	const json = Response.json({ testing: true }, { status: 404 });
	// noinspection SuspiciousTypeOfGuard
	t.true(json instanceof Response);
	t.is(json.status, 404);
	t.is(json.headers.get("Content-Type"), "application/json");
	t.deepEqual(await json.json(), { testing: true });
});

test("Response: requires status 101 for WebSocket handshakes response", (t) => {
	const pair = new WebSocketPair();
	t.throws(() => new Response(null, { webSocket: pair["0"] }), {
		instanceOf: RangeError,
		message: "Responses with a WebSocket must have status code 101.",
	});
});
test("Response: only allows status 101 for WebSocket response", (t) => {
	t.throws(() => new Response(null, { status: 101 }), {
		instanceOf: RangeError,
		message: 'init["status"] must be in the range of 200 to 599, inclusive.',
	});
});

test("Response: clone: returns correctly typed value", async (t) => {
	const response = new Response("text");
	const clone1 = response.clone();
	const clone2 = clone1.clone(); // Test cloning a clone

	// noinspection SuspiciousTypeOfGuard
	t.true(clone1 instanceof Response);
	// noinspection SuspiciousTypeOfGuard
	t.true(clone2 instanceof Response);
	t.is(await response.text(), "text");
	t.is(await clone1.text(), "text");
	t.is(await clone2.text(), "text");
});
test("Response: clone: fails on WebSocket handshake response", (t) => {
	const pair = new WebSocketPair();
	const res = new Response(null, {
		status: 101,
		webSocket: pair["0"],
	});
	t.throws(() => res.clone(), {
		instanceOf: TypeError,
		message: "Cannot clone a response to a WebSocket handshake.",
	});
});
