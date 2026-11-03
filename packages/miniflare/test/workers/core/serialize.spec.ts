import { Buffer } from "node:buffer";
import { parse, stringify } from "devalue";
import {
	structuredSerializableReducers,
	structuredSerializableRevivers,
} from "miniflare";
import { test } from "vitest";

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
