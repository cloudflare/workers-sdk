import test from "ava";
import { parse, stringify } from "devalue";
import {
	structuredSerializableReducers,
	structuredSerializableRevivers,
} from "miniflare";

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
