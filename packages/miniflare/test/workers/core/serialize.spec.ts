import { Buffer } from "node:buffer";
import { parse, stringify } from "devalue";
import {
	createHTTPReducers,
	createHTTPRevivers,
	structuredSerializableReducers,
	structuredSerializableRevivers,
} from "miniflare";
import { test } from "vitest";
import { NODE_PLATFORM_IMPL } from "../../../src/plugins/core/proxy/types";

test("serialize Buffer as Uint8Array", ({ expect }) => {
	const input = Buffer.from([99, 88, 77]);

	const serialized = stringify(input, structuredSerializableReducers);
	const deserialized = parse(serialized, structuredSerializableRevivers);

	// Buffer should round-trip as Uint8Array since Buffer isn't available in all runtimes
	expect(deserialized).toBeInstanceOf(Uint8Array);
	expect(new Uint8Array(deserialized as ArrayBuffer)).toEqual(
		new Uint8Array([99, 88, 77])
	);
});

test("serialize RegExp object consisting of only ascii chars", ({ expect }) => {
	const input = new RegExp(/HelloWorld/);

	const serialized = stringify(input, structuredSerializableReducers);
	expect(serialized).toBe('[["RegExp",1],[2,3],"RegExp","SGVsbG9Xb3JsZA=="]');

	const deserialized = parse(serialized, structuredSerializableRevivers);
	expect(deserialized).toEqual(input);
});

test("serialize RegExp object containing non-ascii chars", ({ expect }) => {
	const input = new RegExp(/こんにちは/);

	const serialized = stringify(input, structuredSerializableReducers);
	expect(serialized).toBe(
		'[["RegExp",1],[2,3],"RegExp","44GT44KT44Gr44Gh44Gv"]'
	);

	const deserialized = parse(serialized, structuredSerializableRevivers);
	expect(deserialized).toEqual(input);
});

test("serialize Headers object consisting of multiple Set-Cookie headers", ({
	expect,
}) => {
	const impl = NODE_PLATFORM_IMPL;

	const headers = new impl.Headers([
		["content-type", "application/json"],
		["authorization", "Bearer token"],
	]);
	headers.append("Set-Cookie", "cookie1=value_for_cookie_1; Path=/; HttpOnly;");
	headers.append("Set-Cookie", "cookie2=value_for_cookie_2; Path=/; HttpOnly;");

	const serialized = stringify(headers, createHTTPReducers(impl));
	const deserialized = parse(serialized, createHTTPRevivers(impl));
	expect(deserialized).toBeInstanceOf(impl.Headers);
	expect(deserialized.get("content-type")).toBe("application/json");
	expect(deserialized.get("authorization")).toBe("Bearer token");
	expect(deserialized.getSetCookie()).toEqual([
		"cookie1=value_for_cookie_1; Path=/; HttpOnly;",
		"cookie2=value_for_cookie_2; Path=/; HttpOnly;",
	]);
});

test("serialize Headers instance from a different `Headers` implementation", ({
	expect,
}) => {
	// Regression test for https://github.com/cloudflare/workers-sdk/issues/6047.
	// Node's global `Headers` is backed by an internal copy of `undici` that
	// isn't `instanceof` the `undici` package Miniflare imports, so previously
	// failed to serialise with `DevalueError: Cannot stringify arbitrary
	// non-POJOs`.
	const impl = NODE_PLATFORM_IMPL;

	const headers = new globalThis.Headers([["x-key", "value"]]);
	expect(headers).not.toBeInstanceOf(impl.Headers);

	const serialized = stringify(headers, createHTTPReducers(impl));
	const deserialized = parse(serialized, createHTTPRevivers(impl));
	expect(deserialized).toBeInstanceOf(impl.Headers);
	expect(deserialized.get("x-key")).toBe("value");
});

test("does not treat an object with a forged Headers tag as Headers", ({
	expect,
}) => {
	// `Symbol.toStringTag` alone isn't a reliable brand, since any object can
	// set it. The reducer must also check for the shape a real `Headers` has,
	// so a forged tag doesn't get its (possibly side-effecting) methods
	// invoked.
	const impl = NODE_PLATFORM_IMPL;
	const fake = { [Symbol.toStringTag]: "Headers" };

	expect(() => stringify(fake, createHTTPReducers(impl))).toThrow(
		/symbolic keys/
	);
});

test("serialize Error preserves primitive own properties and custom names", ({
	expect,
}) => {
	const input = Object.assign(new Error("Repository not found: missing."), {
		code: "NOT_FOUND",
		retryable: false,
		details: null,
	});
	Object.defineProperty(input, "numericCode", { value: 10200 });
	input.name = "ArtifactsError";

	const serialized = stringify(input, structuredSerializableReducers);
	const deserialized = parse(serialized, structuredSerializableRevivers);

	expect(deserialized).toBeInstanceOf(Error);
	expect(deserialized).toMatchObject({
		name: "ArtifactsError",
		message: "Repository not found: missing.",
		code: "NOT_FOUND",
		numericCode: 10200,
		retryable: false,
		details: null,
	});
	expect(Object.keys(deserialized)).not.toContain("name");
});

test("serialize Error keeps built-in constructors and skips non-primitive properties", ({
	expect,
}) => {
	const input = Object.assign(new TypeError("bad input"), {
		code: "INVALID_INPUT",
		callback: () => {},
		nested: { value: 1 },
	});

	const serialized = stringify(input, structuredSerializableReducers);
	const deserialized = parse(serialized, structuredSerializableRevivers);

	expect(deserialized).toBeInstanceOf(TypeError);
	expect(deserialized.name).toBe("TypeError");
	expect(deserialized.code).toBe("INVALID_INPUT");
	expect(deserialized).not.toHaveProperty("callback");
	expect(deserialized).not.toHaveProperty("nested");
});

test("serialize Error without extra properties keeps the existing encoding", ({
	expect,
}) => {
	const input = new RangeError("out of range");
	input.stack = "stack";

	const serialized = stringify(input, structuredSerializableReducers);

	expect(serialized).toBe(
		'[["Error",1],[2,3,4,-1],"RangeError","out of range","stack"]'
	);
	const deserialized = parse(serialized, structuredSerializableRevivers);
	expect(deserialized).toBeInstanceOf(RangeError);
	expect(deserialized.message).toBe("out of range");
});
