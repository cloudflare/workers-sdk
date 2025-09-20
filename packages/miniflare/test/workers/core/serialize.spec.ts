import test from "ava";
import { parse, stringify } from "devalue";
import {
	createHTTPReducers,
	createHTTPRevivers,
	structuredSerializableReducers,
	structuredSerializableRevivers,
} from "miniflare";
import { NODE_PLATFORM_IMPL } from "../../../src/plugins/core/proxy/types";

test("serialize RegExp object consisting of only ascii chars", (t) => {
	const input = new RegExp(/HelloWorld/);

	const serialized = stringify(input, structuredSerializableReducers);
	t.is(serialized, '[["RegExp",1],[2,3],"RegExp","SGVsbG9Xb3JsZA=="]');

	const deserialized = parse(serialized, structuredSerializableRevivers);
	t.deepEqual(deserialized, input);
});

test("serialize RegExp object containing non-ascii chars", (t) => {
	const input = new RegExp(/こんにちは/);

	const serialized = stringify(input, structuredSerializableReducers);
	t.is(serialized, '[["RegExp",1],[2,3],"RegExp","44GT44KT44Gr44Gh44Gv"]');

	const deserialized = parse(serialized, structuredSerializableRevivers);
	t.deepEqual(deserialized, input);
});

test("serialize Headers object consisting of multiple Set-Cookie headers", (t) => {
	const impl = NODE_PLATFORM_IMPL;

	const headers = new impl.Headers([
		["content-type", "application/json"],
		["authorization", "Bearer token"],
	]);
	headers.append("Set-Cookie", "cookie1=value_for_cookie_1; Path=/; HttpOnly;");
	headers.append("Set-Cookie", "cookie2=value_for_cookie_2; Path=/; HttpOnly;");

	const serialized = stringify(headers, createHTTPReducers(impl));
	const deserialized = parse(serialized, createHTTPRevivers(impl));
	t.true(deserialized instanceof impl.Headers);
	t.is(deserialized.get("content-type"), "application/json");
	t.is(deserialized.get("authorization"), "Bearer token");
	t.deepEqual(deserialized.getSetCookie(), [
		"cookie1=value_for_cookie_1; Path=/; HttpOnly;",
		"cookie2=value_for_cookie_2; Path=/; HttpOnly;",
	]);
});
