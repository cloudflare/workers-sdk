// noinspection TypeScriptValidateJSTypes

import assert from "assert";
import crypto from "crypto";
import path from "path";
import { text } from "stream/consumers";
import type {
	R2Conditional,
	R2ListOptions,
	R2Bucket as WorkersR2Bucket,
} from "@cloudflare/workers-types/experimental";
import { Macro, ThrowsExpectation } from "ava";
import {
	Headers,
	MiniflareOptions,
	MultipartPartRow,
	ObjectRow,
	R2Bucket,
	R2Gateway,
	R2Object,
	R2ObjectBody,
	R2Objects,
	Storage,
	TypedDatabase,
	createFileStorage,
} from "miniflare";
import {
	MiniflareTestContext,
	isWithin,
	miniflareTest,
	useTmp,
} from "../../test-shared";

const WITHIN_EPSILON = 10_000;

function sqlStmts(db: TypedDatabase) {
	return {
		getObjectByKey: db.prepare<string, ObjectRow>(
			"SELECT * FROM _mf_objects WHERE key = ?"
		),
		getPartsByUploadId: db.prepare<string, MultipartPartRow>(
			"SELECT * FROM _mf_multipart_parts WHERE upload_id = ? ORDER BY part_number"
		),
	};
}

function hash(value: string, algorithm = "md5") {
	return crypto.createHash(algorithm).update(value).digest("hex");
}

type NamespacedR2Bucket = R2Bucket & { ns: string };

// Automatically prefix all keys with the specified namespace
function nsBucket(ns: string, bucket: R2Bucket): NamespacedR2Bucket {
	return new Proxy(bucket as NamespacedR2Bucket, {
		get(target, key, receiver) {
			if (key === "ns") return ns;
			const value = Reflect.get(target, key, receiver);
			if (typeof value === "function" && key !== "list") {
				return (keys: string | string[], ...args: unknown[]) => {
					if (typeof keys === "string") keys = ns + keys;
					if (Array.isArray(keys)) keys = keys.map((key) => ns + key);
					return value(keys, ...args);
				};
			}
			return value;
		},
		set(target, key, newValue, receiver) {
			if (key === "ns") {
				ns = newValue;
				return true;
			} else {
				return Reflect.set(target, key, newValue, receiver);
			}
		},
	});
}

interface Context extends MiniflareTestContext {
	ns: string;
	r2: NamespacedR2Bucket;
	storage: Storage;
}

const opts: Partial<MiniflareOptions> = {
	r2Buckets: { BUCKET: "bucket" },
	compatibilityFlags: ["r2_list_honor_include"],
};
const test = miniflareTest<{ BUCKET: WorkersR2Bucket }, Context>(
	opts,
	async (global) => {
		return new global.Response(null, { status: 404 });
	}
);

test.beforeEach(async (t) => {
	// Namespace keys so tests which are accessing the same Miniflare instance
	// and bucket don't have races from key collisions
	const ns = `${Date.now()}_${Math.floor(
		Math.random() * Number.MAX_SAFE_INTEGER
	)}`;
	t.context.ns = ns;
	t.context.r2 = nsBucket(ns, await t.context.mf.getR2Bucket("BUCKET"));
	t.context.storage = t.context.mf._getPluginStorage("r2", "bucket");
});

const validatesKeyMacro: Macro<
	[
		{
			method: string;
			f: (r2: NamespacedR2Bucket, key?: any) => Promise<unknown>;
		},
	],
	Context
> = {
	title(providedTitle, { method }) {
		return providedTitle ?? `${method}: validates key`;
	},
	async exec(t, { method, f }) {
		const { r2, ns } = t.context;
		await t.throwsAsync(f(r2, "x".repeat(1025 - ns.length)), {
			instanceOf: Error,
			message: `${method}: The specified object name is not valid. (10020)`,
		});
	},
};

test("head: returns null for non-existent keys", async (t) => {
	const { r2 } = t.context;
	t.is(await r2.head("key"), null);
});
test("head: returns metadata for existing keys", async (t) => {
	const { r2, ns } = t.context;
	const start = Date.now();
	await r2.put("key", "value", {
		httpMetadata: {
			contentType: "text/plain",
			contentLanguage: "en-GB",
			contentDisposition: 'attachment; filename="value.txt"',
			contentEncoding: "gzip",
			cacheControl: "max-age=3600",
			cacheExpiry: new Date("Fri, 24 Feb 2023 00:00:00 GMT"),
		},
		customMetadata: { key: "value" },
	});
	const object = await r2.head("key");
	assert(object !== null);
	t.is(object.key, `${ns}key`);
	t.regex(object.version, /^[0-9a-f]{32}$/);
	t.is(object.size, "value".length);
	t.is(object.etag, "2063c1608d6e0baf80249c42e2be5804");
	t.is(object.httpEtag, `"2063c1608d6e0baf80249c42e2be5804"`);
	t.deepEqual(object.checksums.toJSON(), {
		md5: "2063c1608d6e0baf80249c42e2be5804",
	});
	t.deepEqual(object.httpMetadata, {
		contentType: "text/plain",
		contentLanguage: "en-GB",
		contentDisposition: 'attachment; filename="value.txt"',
		contentEncoding: "gzip",
		cacheControl: "max-age=3600",
		cacheExpiry: new Date("Fri, 24 Feb 2023 00:00:00 GMT"),
	});
	t.deepEqual(object.customMetadata, { key: "value" });
	t.deepEqual(object.range, { offset: 0, length: 5 });
	isWithin(t, WITHIN_EPSILON, object.uploaded.getTime(), start);

	// Test proxying of `writeHttpMetadata()`
	const headers = new Headers({ "X-Key": "value" });
	t.is(object.writeHttpMetadata(headers), undefined);
	t.is(headers.get("Content-Type"), "text/plain");
	t.is(headers.get("X-Key"), "value");
});
test(validatesKeyMacro, { method: "head", f: (r2, key) => r2.head(key) });

test("get: returns null for non-existent keys", async (t) => {
	const { r2 } = t.context;
	t.is(await r2.get("key"), null);
});
test("get: returns metadata and body for existing keys", async (t) => {
	const { r2, ns } = t.context;
	const start = Date.now();
	await r2.put("key", "value", {
		httpMetadata: {
			contentType: "text/plain",
			contentLanguage: "en-GB",
			contentDisposition: 'attachment; filename="value.txt"',
			contentEncoding: "gzip",
			cacheControl: "max-age=3600",
			cacheExpiry: new Date("Fri, 24 Feb 2023 00:00:00 GMT"),
		},
		customMetadata: { key: "value" },
	});
	const body = await r2.get("key");
	assert(body !== null);
	t.is(body.key, `${ns}key`);
	t.regex(body.version, /^[0-9a-f]{32}$/);
	t.is(body.size, "value".length);
	t.is(body.etag, "2063c1608d6e0baf80249c42e2be5804");
	t.is(body.httpEtag, `"2063c1608d6e0baf80249c42e2be5804"`);
	t.deepEqual(body.checksums.toJSON(), {
		md5: "2063c1608d6e0baf80249c42e2be5804",
	});
	t.deepEqual(body.httpMetadata, {
		contentType: "text/plain",
		contentLanguage: "en-GB",
		contentDisposition: 'attachment; filename="value.txt"',
		contentEncoding: "gzip",
		cacheControl: "max-age=3600",
		cacheExpiry: new Date("Fri, 24 Feb 2023 00:00:00 GMT"),
	});
	t.deepEqual(body.customMetadata, { key: "value" });
	t.deepEqual(body.range, { offset: 0, length: 5 });
	isWithin(t, WITHIN_EPSILON, body.uploaded.getTime(), start);

	// Test proxying of `writeHttpMetadata()`
	const headers = new Headers({ "X-Key": "value" });
	t.is(body.writeHttpMetadata(headers), undefined);
	t.is(headers.get("Content-Type"), "text/plain");
	t.is(headers.get("X-Key"), "value");
});
test(validatesKeyMacro, { method: "get", f: (r2, key) => r2.get(key) });
test("get: range using object", async (t) => {
	const { r2 } = t.context;
	await r2.put("key", "value");

	// Check with offset
	let body = await r2.get("key", { range: { offset: 3 } });
	assert(body !== null);
	t.deepEqual(body.range, { offset: 3, length: 2 });
	t.is(await body.text(), "ue");

	// Check with length
	body = await r2.get("key", { range: { length: 3 } });
	assert(body !== null);
	t.deepEqual(body.range, { offset: 0, length: 3 });
	t.is(await body.text(), "val");
	// Check with overflowing length
	body = await r2.get("key", { range: { length: 42 } });
	assert(body !== null);
	t.deepEqual(body.range, { offset: 0, length: 5 });
	t.is(await body.text(), "value");

	// Check with offset and length
	body = await r2.get("key", { range: { offset: 1, length: 3 } });
	assert(body !== null);
	t.deepEqual(body.range, { offset: 1, length: 3 });
	t.is(await body.text(), "alu");

	// Check with suffix
	body = await r2.get("key", { range: { suffix: 3 } });
	assert(body !== null);
	t.deepEqual(body.range, { offset: 2, length: 3 });
	t.is(await body.text(), "lue");
	// Check with underflowing suffix
	body = await r2.get("key", { range: { suffix: 42 } });
	assert(body !== null);
	t.deepEqual(body.range, { offset: 0, length: 5 });
	t.is(await body.text(), "value");

	// Check unsatisfiable ranges
	const expectations: ThrowsExpectation<Error> = {
		instanceOf: Error,
		message: "get: The requested range is not satisfiable (10039)",
	};
	await t.throwsAsync(r2.get("key", { range: { offset: 42 } }), expectations);
	await t.throwsAsync(r2.get("key", { range: { length: 0 } }), expectations);
	await t.throwsAsync(r2.get("key", { range: { suffix: 0 } }), expectations);
	// `workerd` will validate all numbers are positive, and suffix not mixed with
	// offset or length:
	// https://github.com/cloudflare/workerd/blob/4290f9717bc94647d9c8afd29602cdac97fdff1b/src/workerd/api/r2-bucket.c%2B%2B#L239-L265
});
test('get: range using "Range" header', async (t) => {
	const { r2 } = t.context;
	const value = "abcdefghijklmnopqrstuvwxyz";
	await r2.put("key", value);
	const range = new Headers();

	// Check missing "Range" header returns full response
	let body = await r2.get("key", { range });
	assert(body !== null);
	t.is(await body.text(), value);
	t.deepEqual(body.range, { offset: 0, length: 26 });

	// Check "Range" with start and end returns partial response
	range.set("Range", "bytes=3-6");
	body = await r2.get("key", { range });
	assert(body !== null);
	t.is(await body.text(), "defg");
	t.deepEqual(body.range, { offset: 3, length: 4 });

	// Check "Range" with just start returns partial response
	range.set("Range", "bytes=10-");
	body = await r2.get("key", { range });
	assert(body !== null);
	t.is(await body.text(), "klmnopqrstuvwxyz");
	t.deepEqual(body.range, { offset: 10, length: 16 });

	// Check "Range" with just end returns partial response
	range.set("Range", "bytes=-5");
	body = await r2.get("key", { range });
	assert(body !== null);
	t.is(await body.text(), "vwxyz");
	t.deepEqual(body.range, { offset: 21, length: 5 });

	// Check "Range" with multiple ranges returns full response
	range.set("Range", "bytes=5-6,10-11");
	body = await r2.get("key", { range });
	assert(body !== null);
	t.is(await body.text(), value);
	t.deepEqual(body.range, { offset: 0, length: 26 });
});
test("get: returns body only if passes onlyIf", async (t) => {
	const { r2 } = t.context;
	const pastDate = new Date(Date.now() - 60_000);
	await r2.put("key", "value");
	const futureDate = new Date(Date.now() + 60_000);
	const etag = hash("value");
	const badEtag = hash("👻");

	// `workerd` will handle extracting `onlyIf`s from `Header`s:
	// https://github.com/cloudflare/workerd/blob/4290f9717bc94647d9c8afd29602cdac97fdff1b/src/workerd/api/r2-bucket.c%2B%2B#L195-L201
	// Only doing basic tests here, more complex tests are in validator.spec.ts

	const pass = async (cond: R2Conditional) => {
		const object = await r2.get("key", { onlyIf: cond });
		// R2ObjectBody
		t.true(object !== null && "body" in object && object?.body !== undefined);
	};
	const fail = async (cond: R2Conditional) => {
		const object = await r2.get("key", { onlyIf: cond });
		t.not(object, null);
		// R2Object
		t.true(object !== null && !("body" in object));
	};

	await pass({ etagMatches: etag });
	await fail({ etagMatches: badEtag });

	await fail({ etagDoesNotMatch: etag });
	await pass({ etagDoesNotMatch: badEtag });

	await pass({ uploadedBefore: futureDate });
	await fail({ uploadedBefore: pastDate });

	await fail({ uploadedAfter: futureDate });
	await pass({ uploadedAfter: pastDate });
});

test("put: returns metadata for created object", async (t) => {
	const { r2, ns } = t.context;
	const start = Date.now();
	// `workerd` will handle extracting `httpMetadata`s from `Header`s:
	// https://github.com/cloudflare/workerd/blob/4290f9717bc94647d9c8afd29602cdac97fdff1b/src/workerd/api/r2-bucket.c%2B%2B#L410-L420
	const object = await r2.put("key", "value", {
		httpMetadata: {
			contentType: "text/plain",
			contentLanguage: "en-GB",
			contentDisposition: 'attachment; filename="value.txt"',
			contentEncoding: "gzip",
			cacheControl: "max-age=3600",
			cacheExpiry: new Date("Fri, 24 Feb 2023 00:00:00 GMT"),
		},
		customMetadata: { key: "value" },
	});
	t.is(object.key, `${ns}key`);
	t.regex(object.version, /^[0-9a-f]{32}$/);
	t.is(object.size, "value".length);
	t.is(object.etag, "2063c1608d6e0baf80249c42e2be5804");
	t.is(object.httpEtag, `"2063c1608d6e0baf80249c42e2be5804"`);
	t.deepEqual(object.checksums.toJSON(), {
		md5: "2063c1608d6e0baf80249c42e2be5804",
	});
	t.deepEqual(object.httpMetadata, {
		contentType: "text/plain",
		contentLanguage: "en-GB",
		contentDisposition: 'attachment; filename="value.txt"',
		contentEncoding: "gzip",
		cacheControl: "max-age=3600",
		cacheExpiry: new Date("Fri, 24 Feb 2023 00:00:00 GMT"),
	});
	t.deepEqual(object.customMetadata, { key: "value" });
	t.is(object.range, undefined);
	isWithin(t, WITHIN_EPSILON, object.uploaded.getTime(), start);
});
test("put: overrides existing keys", async (t) => {
	const { r2, ns, storage, timers } = t.context;
	await r2.put("key", "value1");
	const stmts = sqlStmts(storage.db);
	const objectRow = stmts.getObjectByKey.get(`${ns}key`);
	assert(objectRow?.blob_id != null);

	await r2.put("key", "value2");
	const body = await r2.get("key");
	assert(body !== null);
	t.is(await body.text(), "value2");

	// Check deletes old blob
	await timers.waitForTasks();
	t.is(await storage.blob.get(objectRow.blob_id), null);
});
test(validatesKeyMacro, { method: "put", f: (r2, key) => r2.put(key, "v") });
test("put: validates checksums", async (t) => {
	const { r2 } = t.context;
	const expectations = (
		name: string,
		provided: string,
		expected: string
	): ThrowsExpectation<Error> => ({
		instanceOf: Error,
		message: [
			`put: The ${name} checksum you specified did not match what we received.`,
			`You provided a ${name} checksum with value: ${provided}`,
			`Actual ${name} was: ${expected} (10037)`,
		].join("\n"),
	});

	// `workerd` validates types, hex strings, hash lengths and that we're only
	// specifying one hash:
	// https://github.com/cloudflare/workerd/blob/4290f9717bc94647d9c8afd29602cdac97fdff1b/src/workerd/api/r2-bucket.c%2B%2B#L441-L520

	// Check only stores is computed hash matches
	const md5 = hash("value", "md5");
	await r2.put("key", "value", { md5 });
	const badMd5 = md5.replace("0", "1");
	await t.throwsAsync(
		r2.put("key", "value", { md5: badMd5 }),
		expectations("MD5", badMd5, md5)
	);
	let checksums = (await r2.head("key"))?.checksums.toJSON();
	t.deepEqual(checksums, { md5 });

	const sha1 = hash("value", "sha1");
	await r2.put("key", "value", { sha1 });
	const badSha1 = sha1.replace("0", "1");
	await t.throwsAsync(
		r2.put("key", "value", { sha1: badSha1 }),
		expectations("SHA-1", badSha1, sha1)
	);
	// Check `get()` returns checksums
	checksums = (await r2.get("key"))?.checksums.toJSON();
	t.deepEqual(checksums, { md5, sha1 });

	const sha256 = hash("value", "sha256");
	// Check always stores lowercase hash
	await r2.put("key", "value", { sha256: sha256.toUpperCase() });
	const badSha256 = sha256.replace("0", "1");
	await t.throwsAsync(
		r2.put("key", "value", { sha256: badSha256 }),
		expectations("SHA-256", badSha256, sha256)
	);
	checksums = (await r2.head("key"))?.checksums.toJSON();
	t.deepEqual(checksums, { md5, sha256 });

	const sha384 = hash("value", "sha384");
	await r2.put("key", "value", { sha384 });
	const badSha384 = sha384.replace("0", "1");
	await t.throwsAsync(
		r2.put("key", "value", { sha384: badSha384 }),
		expectations("SHA-384", badSha384, sha384)
	);
	checksums = (await r2.head("key"))?.checksums.toJSON();
	t.deepEqual(checksums, { md5, sha384 });

	const sha512 = hash("value", "sha512");
	await r2.put("key", "value", { sha512 });
	const badSha512 = sha512.replace("0", "1");
	await t.throwsAsync(
		r2.put("key", "value", { sha512: badSha512 }),
		expectations("SHA-512", badSha512, sha512)
	);
	checksums = (await r2.head("key"))?.checksums.toJSON();
	t.deepEqual(checksums, { md5, sha512 });
});
test("put: stores only if passes onlyIf", async (t) => {
	const { r2 } = t.context;
	const pastDate = new Date(Date.now() - 60_000);
	const futureDate = new Date(Date.now() + 300_000);
	const etag = hash("1");
	const badEtag = hash("👻");

	const reset = () => r2.put("key", "1");
	await reset();

	const pass = async (cond: R2Conditional) => {
		const object = await r2.put("key", "2", { onlyIf: cond });
		t.not(object, null);
		t.is(await (await r2.get("key"))?.text(), "2");
		await reset();
	};
	const fail = async (cond: R2Conditional) => {
		const object = await r2.put("key", "2", { onlyIf: cond });
		t.is(object as R2Object | null, null);
		t.is(await (await r2.get("key"))?.text(), "1");
		// No `reset()` as we've just checked we didn't update anything
	};

	// `workerd` will handle extracting `onlyIf`s from `Header`s:
	// https://github.com/cloudflare/workerd/blob/4290f9717bc94647d9c8afd29602cdac97fdff1b/src/workerd/api/r2-bucket.c%2B%2B#L195-L201
	// Only doing basic tests here, more complex tests are in validator.spec.ts

	await pass({ etagMatches: etag });
	await fail({ etagMatches: badEtag });

	await fail({ etagDoesNotMatch: etag });
	await pass({ etagDoesNotMatch: badEtag });

	await pass({ uploadedBefore: futureDate });
	await fail({ uploadedBefore: pastDate });

	await fail({ uploadedAfter: futureDate });
	await pass({ uploadedAfter: pastDate });

	// Check non-existent key with failed condition
	const object = await r2.put("no-key", "2", { onlyIf: { etagMatches: etag } });
	t.is(object as R2Object | null, null);
});
test("put: validates metadata size", async (t) => {
	const { r2 } = t.context;

	const expectations: ThrowsExpectation<Error> = {
		instanceOf: Error,
		message:
			"put: Your metadata headers exceed the maximum allowed metadata size. (10012)",
	};

	// Check with ASCII characters
	await r2.put("key", "value", { customMetadata: { key: "x".repeat(2045) } });
	await t.throwsAsync(
		r2.put("key", "value", { customMetadata: { key: "x".repeat(2046) } }),
		expectations
	);
	await r2.put("key", "value", { customMetadata: { hi: "x".repeat(2046) } });

	// Check with extended characters: note "🙂" is 2 UTF-16 code units, so
	// `"🙂".length === 2`, and it requires 4 bytes to store
	await r2.put("key", "value", { customMetadata: { key: "🙂".repeat(511) } }); // 3 + 4*511 = 2047
	await r2.put("key", "value", { customMetadata: { key1: "🙂".repeat(511) } }); // 4 + 4*511 = 2048
	await t.throwsAsync(
		r2.put("key", "value", { customMetadata: { key12: "🙂".repeat(511) } }), // 5 + 4*511 = 2049
		expectations
	);
	await t.throwsAsync(
		r2.put("key", "value", { customMetadata: { key: "🙂".repeat(512) } }), // 3 + 4*512 = 2051
		expectations
	);
});

test("delete: deletes existing keys", async (t) => {
	const { r2, ns, storage, timers } = t.context;

	// Check does nothing with non-existent key
	await r2.delete("key");

	// Check deletes single key
	await r2.put("key", "value");
	const stmts = sqlStmts(storage.db);
	const objectRow = stmts.getObjectByKey.get(`${ns}key`);
	assert(objectRow?.blob_id != null);
	t.not(await r2.head("key"), null);
	await r2.delete("key");
	t.is(await r2.head("key"), null);
	// Check deletes old blob
	await timers.waitForTasks();
	t.is(await storage.blob.get(objectRow.blob_id), null);

	// Check deletes multiple keys, skipping non-existent keys
	await r2.put("key1", "value1");
	await r2.put("key2", "value2");
	await r2.put("key3", "value3");
	await r2.delete(["key1", "key200", "key3"]);
	t.is(await r2.head("key1"), null);
	t.not(await r2.head("key2"), null);
	t.is(await r2.head("key3"), null);
});
test(validatesKeyMacro, { method: "delete", f: (r2, key) => r2.delete(key) });
test("delete: validates keys", validatesKeyMacro, {
	method: "delete",
	f: (r2, key) => r2.delete(["valid key", key]),
});

const listMacro: Macro<
	[
		{
			keys: string[];
			options?: R2ListOptions;
			pages: string[][];
		},
	],
	Context
> = {
	title(providedTitle) {
		return `list: ${providedTitle}`;
	},
	async exec(t, { keys, options, pages }) {
		const { r2, ns } = t.context;

		// Seed bucket
		for (let i = 0; i < keys.length; i++) await r2.put(keys[i], `value${i}`);

		let lastCursor: string | undefined;
		for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
			const result = await r2.list({
				...options,
				prefix: ns + (options?.prefix ?? ""),
				cursor: options?.cursor ?? lastCursor,
				startAfter: options?.startAfter ? ns + options.startAfter : undefined,
			});
			const { objects, truncated } = result;
			const cursor = truncated ? result.cursor : undefined;

			// Check objects in page match
			const objectKeys = objects.map(({ key }) => key.substring(ns.length));
			const expectedKeys = pages[pageIndex];
			t.deepEqual(objectKeys, expectedKeys, `Unexpected page ${pageIndex}`);

			// Check other return values and advance cursor to next page
			if (pageIndex === pages.length - 1) {
				// Last Page
				t.false(truncated);
				t.is(cursor, undefined);
			} else {
				t.true(truncated);
				t.not(cursor, undefined);
			}
			lastCursor = cursor;
		}
	},
};
test("lists keys in sorted order", listMacro, {
	keys: ["key3", "key1", "key2", ", ", "!"],
	pages: [["!", ", ", "key1", "key2", "key3"]],
});
test("lists keys matching prefix", listMacro, {
	keys: ["section1key1", "section1key2", "section2key1"],
	options: { prefix: "section1" },
	pages: [["section1key1", "section1key2"]],
});
test("returns an empty list with no keys", listMacro, {
	keys: [],
	pages: [[]],
});
test("returns an empty list with no matching keys", listMacro, {
	keys: ["key1", "key2", "key3"],
	options: { prefix: "none" },
	pages: [[]],
});
test("returns an empty list with an invalid cursor", listMacro, {
	keys: ["key1", "key2", "key3"],
	options: { cursor: "bad" },
	pages: [[]],
});
test("paginates keys", listMacro, {
	keys: ["key1", "key2", "key3"],
	options: { limit: 2 },
	pages: [["key1", "key2"], ["key3"]],
});
test("paginates keys matching prefix", listMacro, {
	keys: ["section1key1", "section1key2", "section1key3", "section2key1"],
	options: { prefix: "section1", limit: 2 },
	pages: [["section1key1", "section1key2"], ["section1key3"]],
});
test("lists keys starting from startAfter exclusive", listMacro, {
	keys: ["key1", "key2", "key3", "key4"],
	options: { startAfter: "key2" },
	pages: [["key3", "key4"]],
});
test(
	"lists keys with startAfter and limit (where startAfter matches key)",
	listMacro,
	{
		keys: ["key1", "key2", "key3", "key4"],
		options: { startAfter: "key1", limit: 2 },
		pages: [["key2", "key3"], ["key4"]],
	}
);
test(
	"lists keys with startAfter and limit (where startAfter doesn't match key)",
	listMacro,
	{
		keys: ["key1", "key2", "key3", "key4"],
		options: { startAfter: "key", limit: 2 },
		pages: [
			["key1", "key2"],
			["key3", "key4"],
		],
	}
);

test("list: returns metadata with objects", async (t) => {
	const { r2, ns } = t.context;
	const start = Date.now();
	await r2.put("key", "value");
	const { objects } = await r2.list({ prefix: ns });
	t.is(objects.length, 1);
	const object = objects[0];
	t.is(object.key, `${ns}key`);
	t.regex(object.version, /^[0-9a-f]{32}$/);
	t.is(object.size, "value".length);
	t.is(object.etag, "2063c1608d6e0baf80249c42e2be5804");
	t.is(object.httpEtag, `"2063c1608d6e0baf80249c42e2be5804"`);
	t.deepEqual(object.checksums.toJSON(), {
		md5: "2063c1608d6e0baf80249c42e2be5804",
	});
	t.deepEqual(object.httpMetadata, {});
	t.deepEqual(object.customMetadata, {});
	t.is(object.range, undefined);
	isWithin(t, WITHIN_EPSILON, object.uploaded.getTime(), start);
});
test("list: paginates with variable limit", async (t) => {
	const { r2, ns } = t.context;
	await r2.put("key1", "value1");
	await r2.put("key2", "value2");
	await r2.put("key3", "value3");

	// Get first page
	let result = await r2.list({ prefix: ns, limit: 1 });
	t.is(result.objects.length, 1);
	t.is(result.objects[0].key, `${ns}key1`);
	assert(result.truncated && result.cursor !== undefined);

	// Get second page with different limit
	result = await r2.list({ prefix: ns, limit: 2, cursor: result.cursor });
	t.is(result.objects.length, 2);
	t.is(result.objects[0].key, `${ns}key2`);
	t.is(result.objects[1].key, `${ns}key3`);
	t.false(result.truncated && result.cursor === undefined);
});
test("list: returns keys inserted whilst paginating", async (t) => {
	const { r2, ns } = t.context;
	await r2.put("key1", "value1");
	await r2.put("key3", "value3");
	await r2.put("key5", "value5");

	// Get first page
	let result = await r2.list({ prefix: ns, limit: 2 });
	t.is(result.objects.length, 2);
	t.is(result.objects[0].key, `${ns}key1`);
	t.is(result.objects[1].key, `${ns}key3`);
	assert(result.truncated && result.cursor !== undefined);

	// Insert key2 and key4
	await r2.put("key2", "value2");
	await r2.put("key4", "value4");

	// Get second page, expecting to see key4 but not key2
	result = await r2.list({ prefix: ns, limit: 2, cursor: result.cursor });
	t.is(result.objects.length, 2);
	t.is(result.objects[0].key, `${ns}key4`);
	t.is(result.objects[1].key, `${ns}key5`);
	t.false(result.truncated && result.cursor === undefined);
});
test("list: validates limit", async (t) => {
	const { r2 } = t.context;
	// R2 actually accepts 0 and -1 as valid limits, but this is probably a bug
	await t.throwsAsync(r2.list({ limit: 0 }), {
		instanceOf: Error,
		message: "list: MaxKeys params must be positive integer <= 1000. (10022)",
	});
	await t.throwsAsync(r2.list({ limit: 1_001 }), {
		instanceOf: Error,
		message: "list: MaxKeys params must be positive integer <= 1000. (10022)",
	});
});
test("list: includes httpMetadata and customMetadata if specified", async (t) => {
	const { r2, ns } = t.context;
	await r2.put("key1", "value1", {
		httpMetadata: { contentEncoding: "gzip" },
		customMetadata: { foo: "bar" },
	});
	await r2.put("key2", "value2", {
		httpMetadata: { contentType: "dinosaur" },
		customMetadata: { bar: "fiz" },
	});
	await r2.put("key3", "value3", {
		httpMetadata: { contentLanguage: "en" },
		customMetadata: { fiz: "bang" },
	});

	// Check no metadata included by default
	let result = await r2.list({ prefix: ns });
	t.deepEqual(result.objects.length, 3);
	t.deepEqual(result.objects[0].httpMetadata, {});
	t.deepEqual(result.objects[0].customMetadata, {});
	t.deepEqual(result.objects[1].httpMetadata, {});
	t.deepEqual(result.objects[1].customMetadata, {});
	t.deepEqual(result.objects[2].httpMetadata, {});
	t.deepEqual(result.objects[2].customMetadata, {});

	// Check httpMetadata included if specified
	result = await r2.list({ prefix: ns, include: ["httpMetadata"] });
	t.deepEqual(result.objects.length, 3);
	t.deepEqual(result.objects[0].httpMetadata, { contentEncoding: "gzip" });
	t.deepEqual(result.objects[0].customMetadata, {});
	t.deepEqual(result.objects[1].httpMetadata, { contentType: "dinosaur" });
	t.deepEqual(result.objects[1].customMetadata, {});
	t.deepEqual(result.objects[2].httpMetadata, { contentLanguage: "en" });
	t.deepEqual(result.objects[2].customMetadata, {});

	// Check customMetadata included if specified
	result = await r2.list({ prefix: ns, include: ["customMetadata"] });
	t.deepEqual(result.objects.length, 3);
	t.deepEqual(result.objects[0].httpMetadata, {});
	t.deepEqual(result.objects[0].customMetadata, { foo: "bar" });
	t.deepEqual(result.objects[1].httpMetadata, {});
	t.deepEqual(result.objects[1].customMetadata, { bar: "fiz" });
	t.deepEqual(result.objects[2].httpMetadata, {});
	t.deepEqual(result.objects[2].customMetadata, { fiz: "bang" });

	// Check both included if specified
	result = await r2.list({
		prefix: ns,
		include: ["httpMetadata", "customMetadata"],
	});
	t.deepEqual(result.objects.length, 3);
	t.deepEqual(result.objects[0].httpMetadata, { contentEncoding: "gzip" });
	t.deepEqual(result.objects[0].customMetadata, { foo: "bar" });
	t.deepEqual(result.objects[1].httpMetadata, { contentType: "dinosaur" });
	t.deepEqual(result.objects[1].customMetadata, { bar: "fiz" });
	t.deepEqual(result.objects[2].httpMetadata, { contentLanguage: "en" });
	t.deepEqual(result.objects[2].customMetadata, { fiz: "bang" });

	// `workerd` will validate the `include` array:
	// https://github.com/cloudflare/workerd/blob/44907df95f231a2411d4e9767400951e55c6eb4c/src/workerd/api/r2-bucket.c%2B%2B#L737
});
test("list: returns correct delimitedPrefixes for delimiter and prefix", async (t) => {
	const { r2, ns } = t.context;
	const values: Record<string, string> = {
		// In lexicographic key order, so `allKeys` is sorted
		"dir0/file0": "value0",
		"dir0/file1": "value1",
		"dir0/sub0/file2": "value2",
		"dir0/sub0/file3": "value3",
		"dir0/sub1/file4": "value4",
		"dir0/sub1/file5": "value5",
		"dir1/file6": "value6",
		"dir1/file7": "value7",
		file8: "value8",
		file9: "value9",
	};
	const allKeys = Object.keys(values);
	for (const [key, value] of Object.entries(values)) await r2.put(key, value);

	const keys = (result: R2Objects) =>
		result.objects.map(({ key }) => key.substring(ns.length));
	const delimitedPrefixes = (result: R2Objects) =>
		result.delimitedPrefixes.map((prefix) => prefix.substring(ns.length));
	const allKeysWithout = (...exclude: string[]) =>
		allKeys.filter((value) => !exclude.includes(value));

	// Check no/empty delimiter
	let result = await r2.list({ prefix: ns });
	t.false(result.truncated);
	t.deepEqual(keys(result), allKeys);
	t.deepEqual(delimitedPrefixes(result), []);
	result = await r2.list({ prefix: ns, delimiter: "" });
	t.false(result.truncated);
	t.deepEqual(keys(result), allKeys);
	t.deepEqual(delimitedPrefixes(result), []);

	// Check with file delimiter
	result = await r2.list({ prefix: ns, delimiter: "file8" });
	t.false(result.truncated);
	t.deepEqual(keys(result), allKeysWithout("file8"));
	t.deepEqual(delimitedPrefixes(result), ["file8"]);
	// ...and prefix
	result = await r2.list({ prefix: `${ns}dir1/`, delimiter: "file6" });
	t.false(result.truncated);
	t.deepEqual(keys(result), ["dir1/file7"]);
	t.deepEqual(delimitedPrefixes(result), ["dir1/file6"]);

	// Check with "/" delimiter
	result = await r2.list({ prefix: ns, delimiter: "/" });
	t.false(result.truncated);
	t.deepEqual(keys(result), ["file8", "file9"]);
	t.deepEqual(delimitedPrefixes(result), ["dir0/", "dir1/"]);
	// ...and prefix
	result = await r2.list({ prefix: `${ns}dir0/`, delimiter: "/" });
	t.false(result.truncated);
	t.deepEqual(keys(result), ["dir0/file0", "dir0/file1"]);
	t.deepEqual(delimitedPrefixes(result), ["dir0/sub0/", "dir0/sub1/"]);
	result = await r2.list({ prefix: `${ns}dir0`, delimiter: "/" });
	t.false(result.truncated);
	t.deepEqual(keys(result), []);
	t.deepEqual(delimitedPrefixes(result), ["dir0/"]);

	// Check with limit (limit includes returned objects and delimitedPrefixes)
	const opt: R2ListOptions = { prefix: `${ns}dir0/`, delimiter: "/", limit: 2 };
	result = await r2.list(opt);
	assert(result.truncated);
	t.deepEqual(keys(result), ["dir0/file0", "dir0/file1"]);
	t.deepEqual(delimitedPrefixes(result), []);
	result = await r2.list({ ...opt, cursor: result.cursor });
	t.false(result.truncated);
	t.deepEqual(keys(result), []);
	t.deepEqual(delimitedPrefixes(result), ["dir0/sub0/", "dir0/sub1/"]);
});

test.serial("operations permit empty key", async (t) => {
	const { r2 } = t.context;
	// Explicitly testing empty string key, so cannot prefix with namespace
	r2.ns = "";
	// Ensure globally namespaced key cleaned up, so it doesn't affect other tests
	t.teardown(() => r2.delete(""));

	await r2.put("", "empty");
	const object = await r2.head("");
	t.is(object?.key, "");

	const objectBody = await r2.get("");
	t.is(await objectBody?.text(), "empty");

	const { objects } = await r2.list();
	t.is(objects.length, 1);
	t.is(objects[0].key, "");

	await r2.delete("");
	t.is(await r2.head(""), null);
});

test.serial("operations persist stored data", async (t) => {
	const { mf, ns } = t.context;

	// Create new temporary file-system persistence directory
	const tmp = await useTmp(t);
	const storage = createFileStorage(path.join(tmp, "bucket"));

	// Set option, then reset after test
	await t.context.setOptions({ ...opts, r2Persist: tmp });
	t.teardown(() => t.context.setOptions(opts));
	const r2 = nsBucket(ns, await mf.getR2Bucket("BUCKET"));

	// Check put respects persist
	await r2.put("key", "value");
	const stmtListByNs = storage.db.prepare<{ ns: string }, { key: string }>(
		"SELECT key FROM _mf_objects WHERE key LIKE :ns || '%'"
	);
	let stored = stmtListByNs.all({ ns });
	t.deepEqual(stored, [{ key: `${ns}key` }]);

	// Check head respects persist
	let object = await r2.head("key");
	t.is(object?.size, 5);

	// Check get respects persist
	const objectBody = await r2.get("key");
	t.is(await objectBody?.text(), "value");

	// Check list respects persist
	const { objects } = await r2.list();
	t.is(objects.length, 1);
	t.is(objects[0].size, 5);

	// Check delete respects persist
	await r2.delete("key");
	stored = stmtListByNs.all({ ns });
	t.deepEqual(stored, []);

	// Check multipart operations respect persist
	const upload = await r2.createMultipartUpload("multipart");
	const part = await upload.uploadPart(1, "multipart");
	object = await upload.complete([part]);
	t.is(object?.size, 9);
	stored = stmtListByNs.all({ ns });
	t.deepEqual(stored, [{ key: `${ns}multipart` }]);
});

test.serial("operations permit strange bucket names", async (t) => {
	const { mf, ns } = t.context;

	// Set option, then reset after test
	const id = "my/ Bucket";
	await t.context.setOptions({ ...opts, r2Buckets: { BUCKET: id } });
	t.teardown(() => t.context.setOptions(opts));
	const r2 = nsBucket(ns, await mf.getR2Bucket("BUCKET"));

	// Check basic operations work
	await r2.put("key", "value");
	const object = await r2.get("key");
	t.is(await object?.text(), "value");

	// Check stored with correct ID
	const storage = t.context.mf._getPluginStorage("r2", id);
	const stmts = sqlStmts(storage.db);
	t.not(stmts.getObjectByKey.get(`${ns}key`), undefined);
});

// Multipart tests
const PART_SIZE = 50;
// Reduce the minimum multipart part size, so we can use small values for tests
test.before(() => (R2Gateway._MIN_MULTIPART_PART_SIZE = PART_SIZE));

function objectNameNotValidExpectations(method: string) {
	return <ThrowsExpectation<Error>>{
		instanceOf: Error,
		message: `${method}: The specified object name is not valid. (10020)`,
	};
}
function doesNotExistExpectations(method: string) {
	return <ThrowsExpectation<Error>>{
		instanceOf: Error,
		message: `${method}: The specified multipart upload does not exist. (10024)`,
	};
}
function internalErrorExpectations(method: string) {
	return <ThrowsExpectation<Error>>{
		instanceOf: Error,
		message: `${method}: We encountered an internal error. Please try again. (10001)`,
	};
}
test("createMultipartUpload", async (t) => {
	const { r2, ns } = t.context;

	// Check creates upload
	const upload1 = await r2.createMultipartUpload("key", {
		customMetadata: { key: "value" },
		httpMetadata: { contentType: "text/plain" },
	});
	t.is(upload1.key, `${ns}key`);
	t.not(upload1.uploadId, "");

	// Check creates multiple distinct uploads with different uploadIds for key
	const upload2 = await r2.createMultipartUpload("key");
	t.is(upload2.key, `${ns}key`);
	t.not(upload2.uploadId, "");
	t.not(upload2.uploadId, upload1.uploadId);

	// Check validates key
	await t.throwsAsync(
		r2.createMultipartUpload("x".repeat(1025)),
		objectNameNotValidExpectations("createMultipartUpload")
	);
});
test("uploadPart", async (t) => {
	const { storage, r2 } = t.context;

	// Check uploads parts
	const upload = await r2.createMultipartUpload("key");
	const part1 = await upload.uploadPart(1, "value1");
	t.is(part1.partNumber, 1);
	t.not(part1.etag, "");
	const part2 = await upload.uploadPart(2, "value two");
	t.is(part2.partNumber, 2);
	t.not(part2.etag, "");
	t.not(part2.etag, part1.etag);
	const stmts = sqlStmts(storage.db);
	const partRows = stmts.getPartsByUploadId.all(upload.uploadId);
	t.is(partRows.length, 2);
	t.is(partRows[0].part_number, 1);
	t.is(partRows[0].size, 6);
	t.is(partRows[1].part_number, 2);
	t.is(partRows[1].size, 9);
	const value1 = await storage.blob.get(partRows[0].blob_id);
	assert(value1 !== null);
	t.is(await text(value1), "value1");
	const value2 = await storage.blob.get(partRows[1].blob_id);
	assert(value2 !== null);
	t.is(await text(value2), "value two");

	// Check upload part with same part number and same value
	const part1b = await upload.uploadPart(1, "value1");
	t.is(part1b.partNumber, 1);
	t.not(part1b.etag, part1.etag);

	// Check upload part with different part number but same value
	const part100 = await upload.uploadPart(100, "value1");
	t.is(part100.partNumber, 100);
	t.not(part100.etag, part1.etag);

	// Check validates key and uploadId
	let expectations = doesNotExistExpectations("uploadPart");
	let nonExistentUpload = r2.resumeMultipartUpload("key", "bad");
	await t.throwsAsync(nonExistentUpload.uploadPart(1, "value"), expectations);
	nonExistentUpload = r2.resumeMultipartUpload("badkey", upload.uploadId);
	await t.throwsAsync(nonExistentUpload.uploadPart(1, "value"), expectations);
	expectations = objectNameNotValidExpectations("uploadPart");
	nonExistentUpload = r2.resumeMultipartUpload("x".repeat(1025), "bad");
	await t.throwsAsync(nonExistentUpload.uploadPart(1, "value"), expectations);
});
test("abortMultipartUpload", async (t) => {
	const { storage, r2, timers } = t.context;

	// Check deletes upload and all parts for corresponding upload
	const upload1 = await r2.createMultipartUpload("key");
	const upload2 = await r2.createMultipartUpload("key");
	await upload1.uploadPart(1, "value1");
	await upload1.uploadPart(2, "value2");
	await upload1.uploadPart(3, "value3");
	const stmts = sqlStmts(storage.db);
	const parts = stmts.getPartsByUploadId.all(upload1.uploadId);
	t.is(parts.length, 3);
	await upload1.abort();
	t.is(stmts.getPartsByUploadId.all(upload1.uploadId).length, 0);
	// Check blobs deleted
	await timers.waitForTasks();
	for (const part of parts) t.is(await storage.blob.get(part.blob_id), null);

	// Check cannot upload after abort
	let expectations = doesNotExistExpectations("uploadPart");
	await t.throwsAsync(upload1.uploadPart(4, "value4"), expectations);

	// Check can abort already aborted upload
	await upload1.abort();

	// Check can abort already completed upload
	const part1 = await upload2.uploadPart(1, "value1");
	await upload2.complete([part1]);
	await upload2.abort();
	t.is(await (await r2.get("key"))?.text(), "value1");

	// Check validates key and uploadId
	const upload3 = await r2.createMultipartUpload("key");
	// Note this is internalErrorExpectations, not doesNotExistExpectations
	expectations = internalErrorExpectations("abortMultipartUpload");
	let nonExistentUpload = r2.resumeMultipartUpload("key", "bad");
	await t.throwsAsync(nonExistentUpload.abort(), expectations);
	nonExistentUpload = r2.resumeMultipartUpload("bad", upload3.uploadId);
	await t.throwsAsync(nonExistentUpload.abort(), expectations);
	expectations = objectNameNotValidExpectations("abortMultipartUpload");
	nonExistentUpload = r2.resumeMultipartUpload("x".repeat(1025), "bad");
	await t.throwsAsync(nonExistentUpload.abort(), expectations);
});
test("completeMultipartUpload", async (t) => {
	const { storage, r2, ns, timers } = t.context;

	// Check creates regular key with correct metadata, and returns object
	const upload1 = await r2.createMultipartUpload("key", {
		customMetadata: { key: "value" },
		httpMetadata: { contentType: "text/plain" },
	});
	const upload2 = await r2.createMultipartUpload("key");
	let part1 = await upload1.uploadPart(1, "1".repeat(PART_SIZE));
	let part2 = await upload1.uploadPart(2, "2".repeat(PART_SIZE));
	let part3 = await upload1.uploadPart(3, "3");
	let object = await upload1.complete([part1, part2, part3]);
	t.is(object.key, `${ns}key`);
	t.not(object.version, "");
	t.is(object.size, 2 * PART_SIZE + 1);
	t.is(object.etag, "3b676245e58d988dc75f80c0c27a9645-3");
	t.is(object.httpEtag, '"3b676245e58d988dc75f80c0c27a9645-3"');
	t.is(object.range, undefined);
	t.deepEqual(object.checksums.toJSON(), {});
	t.deepEqual(object.customMetadata, { key: "value" });
	t.deepEqual(object.httpMetadata, { contentType: "text/plain" });
	let objectBody = await r2.get("key");
	t.is(
		await objectBody?.text(),
		`${"1".repeat(PART_SIZE)}${"2".repeat(PART_SIZE)}3`
	);
	const stmts = sqlStmts(storage.db);
	const parts = stmts.getPartsByUploadId.all(upload1.uploadId);
	t.is(parts.length, 3);

	// Check requires all but last part to be greater than 5MB
	part1 = await upload2.uploadPart(1, "1");
	part2 = await upload2.uploadPart(2, "2");
	part3 = await upload2.uploadPart(3, "3");
	const sizeExpectations: ThrowsExpectation<Error> = {
		instanceOf: Error,
		message:
			"completeMultipartUpload: Your proposed upload is smaller than the minimum allowed object size. (10011)",
	};
	await t.throwsAsync(
		upload2.complete([part1, part2, part3]),
		sizeExpectations
	);
	await t.throwsAsync(upload2.complete([part1, part2]), sizeExpectations);
	object = await upload2.complete([part1]);
	t.is(object.size, 1);
	t.is(object.etag, "46d1741e8075da4ac72c71d8130fcb71-1");
	// Check previous multipart uploads blobs deleted
	await timers.waitForTasks();
	for (const part of parts) t.is(await storage.blob.get(part.blob_id), null);

	// Check completing multiple uploads overrides existing, deleting all parts
	t.is(stmts.getPartsByUploadId.all(upload1.uploadId).length, 0);
	t.is(stmts.getPartsByUploadId.all(upload2.uploadId).length, 1);
	objectBody = await r2.get("key");
	t.is(await objectBody?.text(), "1");

	// Check completing with overridden part
	const upload3 = await r2.createMultipartUpload("key");
	let part1a = await upload3.uploadPart(1, "value");
	let part1b = await upload3.uploadPart(1, "value");
	t.is(part1a.partNumber, part1b.partNumber);
	t.not(part1a.etag, part1b.etag);
	const notFoundExpectations: ThrowsExpectation<Error> = {
		instanceOf: Error,
		message:
			"completeMultipartUpload: One or more of the specified parts could not be found. (10025)",
	};
	await t.throwsAsync(upload3.complete([part1a]), notFoundExpectations);
	object = await upload3.complete([part1b]);
	t.is(object.size, 5);

	// Check completing with multiple parts of same part number
	const upload4 = await r2.createMultipartUpload("key");
	part1a = await upload4.uploadPart(1, "1".repeat(PART_SIZE));
	part1b = await upload4.uploadPart(1, "2".repeat(PART_SIZE));
	const part1c = await upload4.uploadPart(1, "3".repeat(PART_SIZE));
	await t.throwsAsync(
		upload4.complete([part1a, part1b, part1c]),
		internalErrorExpectations("completeMultipartUpload")
	);

	// Check completing with out-of-order parts
	const upload5a = await r2.createMultipartUpload("key");
	part1 = await upload5a.uploadPart(1, "1".repeat(PART_SIZE));
	part2 = await upload5a.uploadPart(2, "2".repeat(PART_SIZE));
	part3 = await upload5a.uploadPart(3, "3".repeat(PART_SIZE));
	object = await upload5a.complete([part2, part3, part1]);
	t.is(object.size, 3 * PART_SIZE);
	t.is(object.etag, "f1115cc5564e7e0b25bbd87d95c72c86-3");
	objectBody = await r2.get("key");
	t.is(
		await objectBody?.text(),
		`${"1".repeat(PART_SIZE)}${"2".repeat(PART_SIZE)}${"3".repeat(PART_SIZE)}`
	);
	const upload5b = await r2.createMultipartUpload("key");
	part1 = await upload5b.uploadPart(1, "1");
	part2 = await upload5b.uploadPart(2, "2".repeat(PART_SIZE));
	part3 = await upload5b.uploadPart(3, "3".repeat(PART_SIZE));
	// Check part size checking happens in argument order (part1's size isn't
	// checked until too late, as it's the last argument so ignored...)
	await t.throwsAsync(upload5b.complete([part2, part3, part1]), {
		instanceOf: Error,
		message:
			"completeMultipartUpload: There was a problem with the multipart upload. (10048)",
	});
	const upload5c = await r2.createMultipartUpload("key");
	part1 = await upload5c.uploadPart(1, "1".repeat(PART_SIZE));
	part2 = await upload5c.uploadPart(2, "2".repeat(PART_SIZE));
	part3 = await upload5c.uploadPart(3, "3");
	// (...but here, part3 isn't the last argument, so get a regular size error)
	await t.throwsAsync(
		upload5c.complete([part2, part3, part1]),
		sizeExpectations
	);

	// Check completing with missing parts
	const upload6 = await r2.createMultipartUpload("key");
	part2 = await upload6.uploadPart(2, "2".repeat(PART_SIZE));
	const part5 = await upload6.uploadPart(5, "5".repeat(PART_SIZE));
	const part9 = await upload6.uploadPart(9, "9".repeat(PART_SIZE));
	object = await upload6.complete([part2, part5, part9]);
	t.is(object.size, 3 * PART_SIZE);
	t.is(object.etag, "471d773597286301a10c61cd8c84e659-3");
	objectBody = await r2.get("key");
	t.is(
		await objectBody?.text(),
		`${"2".repeat(PART_SIZE)}${"5".repeat(PART_SIZE)}${"9".repeat(PART_SIZE)}`
	);

	// Check completing with no parts
	const upload7 = await r2.createMultipartUpload("key");
	object = await upload7.complete([]);
	t.is(object.size, 0);
	t.is(object.etag, "d41d8cd98f00b204e9800998ecf8427e-0");
	objectBody = await r2.get("key");
	t.is(await objectBody?.text(), "");

	// Check cannot complete with parts from another upload
	const upload8a = await r2.createMultipartUpload("key");
	const upload8b = await r2.createMultipartUpload("key");
	part1 = await upload8b.uploadPart(1, "value");
	await t.throwsAsync(upload8a.complete([part1]), notFoundExpectations);

	// Check cannot complete already completed upload
	const upload9 = await r2.createMultipartUpload("key");
	part1 = await upload9.uploadPart(1, "value");
	await upload9.complete([part1]);
	await t.throwsAsync(
		upload9.complete([part1]),
		doesNotExistExpectations("completeMultipartUpload")
	);

	// Check cannot complete aborted upload
	const upload10 = await r2.createMultipartUpload("key");
	part1 = await upload10.uploadPart(1, "value");
	await upload10.abort();
	await t.throwsAsync(
		upload10.complete([part1]),
		doesNotExistExpectations("completeMultipartUpload")
	);

	// Check validates key and uploadId
	const upload11 = await r2.createMultipartUpload("key");
	// Note this is internalErrorExpectations, not doesNotExistExpectations
	let expectations = internalErrorExpectations("completeMultipartUpload");
	let nonExistentUpload = r2.resumeMultipartUpload("key", "bad");
	await t.throwsAsync(nonExistentUpload.complete([]), expectations);
	nonExistentUpload = r2.resumeMultipartUpload("badkey", upload11.uploadId);
	await t.throwsAsync(nonExistentUpload.complete([]), expectations);
	expectations = objectNameNotValidExpectations("completeMultipartUpload");
	nonExistentUpload = r2.resumeMultipartUpload("x".repeat(1025), "bad");
	await t.throwsAsync(nonExistentUpload.complete([]), expectations);

	// Check requires all but last part to have same size
	const upload13 = await r2.createMultipartUpload("key");
	part1 = await upload13.uploadPart(1, "1".repeat(PART_SIZE));
	part2 = await upload13.uploadPart(2, "2".repeat(PART_SIZE + 1));
	part3 = await upload13.uploadPart(3, "3".repeat(PART_SIZE));
	expectations = {
		instanceOf: Error,
		message:
			"completeMultipartUpload: There was a problem with the multipart upload. (10048)",
	};
	await t.throwsAsync(upload13.complete([part1, part2, part3]), expectations);
	part2 = await upload13.uploadPart(2, "2".repeat(PART_SIZE));
	// Check allows last part to have different size, only if <= others
	part3 = await upload13.uploadPart(3, "3".repeat(PART_SIZE + 1));
	await t.throwsAsync(upload13.complete([part1, part2, part3]), expectations);
	part3 = await upload13.uploadPart(3, "3".repeat(PART_SIZE - 1));
	object = await upload13.complete([part1, part2, part3]);
	t.is(object.size, 3 * PART_SIZE - 1);

	// Check with non-existent and non-matching parts
	const upload14 = await r2.createMultipartUpload("key");
	part1 = await upload14.uploadPart(1, "1".repeat(PART_SIZE));
	part2 = await upload14.uploadPart(2, "2");
	await t.throwsAsync(
		upload14.complete([part1, { partNumber: 3, etag: part2.etag }]),
		notFoundExpectations
	);
	await t.throwsAsync(
		upload14.complete([part1, { partNumber: 2, etag: "bad" }]),
		notFoundExpectations
	);
	await t.throwsAsync(
		upload14.complete([part1, { partNumber: 4, etag: "very bad" }]),
		notFoundExpectations
	);
});
// Check regular operations on buckets with existing multipart keys
test("head: is multipart aware", async (t) => {
	const { r2, ns } = t.context;

	// Check returns nothing for in-progress multipart upload
	const upload = await r2.createMultipartUpload("key", {
		customMetadata: { key: "value" },
		httpMetadata: { contentType: "text/plain" },
	});
	const part1 = await upload.uploadPart(1, "1".repeat(PART_SIZE));
	const part2 = await upload.uploadPart(2, "2".repeat(PART_SIZE));
	const part3 = await upload.uploadPart(3, "3".repeat(PART_SIZE));
	t.is(await r2.head("key"), null);

	// Check returns metadata for completed upload
	const completed = await upload.complete([part1, part2, part3]);
	const object = await r2.head("key");
	t.is(object?.key, `${ns}key`);
	t.is(object?.version, completed.version);
	t.is(object?.size, 3 * PART_SIZE);
	t.is(object?.etag, "f1115cc5564e7e0b25bbd87d95c72c86-3");
	t.is(object?.httpEtag, '"f1115cc5564e7e0b25bbd87d95c72c86-3"');
	t.deepEqual(object?.range, { offset: 0, length: 150 });
	t.deepEqual(object?.checksums.toJSON(), {});
	t.deepEqual(object?.customMetadata, { key: "value" });
	t.deepEqual(object?.httpMetadata, { contentType: "text/plain" });
});
test("get: is multipart aware", async (t) => {
	const { r2, ns } = t.context;

	// Check returns nothing for in-progress multipart upload
	const upload = await r2.createMultipartUpload("key", {
		customMetadata: { key: "value" },
		httpMetadata: { contentType: "text/plain" },
	});
	const part1 = await upload.uploadPart(1, "a".repeat(PART_SIZE));
	const part2 = await upload.uploadPart(2, "b".repeat(PART_SIZE));
	const part3 = await upload.uploadPart(3, "c".repeat(PART_SIZE));
	t.is(await r2.get("key"), null);

	// Check returns metadata and value for completed upload
	const completed = await upload.complete([part1, part2, part3]);
	let object = await r2.get("key");
	t.is(object?.key, `${ns}key`);
	t.is(object?.version, completed.version);
	t.is(object?.size, 3 * PART_SIZE);
	t.is(object?.etag, "d63a28fd44cfddc0215c8da47e582eb7-3");
	t.is(object?.httpEtag, '"d63a28fd44cfddc0215c8da47e582eb7-3"');
	t.deepEqual(object?.range, { offset: 0, length: 3 * PART_SIZE });
	t.deepEqual(object?.checksums.toJSON(), {});
	t.deepEqual(object?.customMetadata, { key: "value" });
	t.deepEqual(object?.httpMetadata, { contentType: "text/plain" });
	t.is(
		await object?.text(),
		`${"a".repeat(PART_SIZE)}${"b".repeat(PART_SIZE)}${"c".repeat(PART_SIZE)}`
	);

	// Check ranged get accessing single part
	const halfPartSize = Math.floor(PART_SIZE / 2);
	const quarterPartSize = Math.floor(PART_SIZE / 4);
	object = (await r2.get("key", {
		range: { offset: halfPartSize, length: quarterPartSize },
	})) as R2ObjectBody | null;
	t.is(await object?.text(), "a".repeat(quarterPartSize));

	// Check ranged get accessing multiple parts
	object = (await r2.get("key", {
		range: {
			offset: halfPartSize,
			length: halfPartSize + PART_SIZE + quarterPartSize,
		},
	})) as R2ObjectBody | null;
	t.is(
		await object?.text(),
		`${"a".repeat(halfPartSize)}${"b".repeat(PART_SIZE)}${"c".repeat(
			quarterPartSize
		)}`
	);

	// Check ranged get of suffix
	object = (await r2.get("key", {
		range: { suffix: quarterPartSize + PART_SIZE },
	})) as R2ObjectBody | null;
	t.is(
		await object?.text(),
		`${"b".repeat(quarterPartSize)}${"c".repeat(PART_SIZE)}`
	);
});
test("put: is multipart aware", async (t) => {
	const { storage, r2, timers } = t.context;

	// Check doesn't overwrite parts for in-progress multipart upload
	const upload = await r2.createMultipartUpload("key");
	const part1 = await upload.uploadPart(1, "1".repeat(PART_SIZE));
	const part2 = await upload.uploadPart(2, "2".repeat(PART_SIZE));
	const part3 = await upload.uploadPart(3, "3".repeat(PART_SIZE));
	await r2.put("key", "value");

	const stmts = sqlStmts(storage.db);
	t.is(stmts.getPartsByUploadId.all(upload.uploadId).length, 3);

	const object = await upload.complete([part1, part2, part3]);
	t.is(object.size, 3 * PART_SIZE);
	const parts = stmts.getPartsByUploadId.all(upload.uploadId);
	t.is(parts.length, 3);

	// Check overwrites all multipart parts of completed upload
	await r2.put("key", "new-value");
	t.is(stmts.getPartsByUploadId.all(upload.uploadId).length, 0);
	// Check deletes all previous blobs
	await timers.waitForTasks();
	for (const part of parts) t.is(await storage.blob.get(part.blob_id), null);
});
test("delete: is multipart aware", async (t) => {
	const { storage, r2, timers } = t.context;

	// Check doesn't remove parts for in-progress multipart upload
	const upload = await r2.createMultipartUpload("key");
	const part1 = await upload.uploadPart(1, "1".repeat(PART_SIZE));
	const part2 = await upload.uploadPart(2, "2".repeat(PART_SIZE));
	const part3 = await upload.uploadPart(3, "3".repeat(PART_SIZE));
	await r2.delete("key");

	// Check removes all multipart parts of completed upload
	const object = await upload.complete([part1, part2, part3]);
	t.is(object.size, 3 * PART_SIZE);
	const stmts = sqlStmts(storage.db);
	const parts = stmts.getPartsByUploadId.all(upload.uploadId);
	t.is(parts.length, 3);
	await r2.delete("key");
	t.is(stmts.getPartsByUploadId.all(upload.uploadId).length, 0);
	// Check deletes all previous blobs
	await timers.waitForTasks();
	for (const part of parts) t.is(await storage.blob.get(part.blob_id), null);
});
test("delete: waits for in-progress multipart gets before deleting part blobs", async (t) => {
	const { storage, r2, timers } = t.context;

	const upload = await r2.createMultipartUpload("key");
	const part1 = await upload.uploadPart(1, "1".repeat(PART_SIZE));
	const part2 = await upload.uploadPart(2, "2".repeat(PART_SIZE));
	const part3 = await upload.uploadPart(3, "3".repeat(PART_SIZE));
	await upload.complete([part1, part2, part3]);

	const objectBody1 = await r2.get("key");
	const objectBody2 = await r2.get("key", { range: { offset: PART_SIZE } });
	const stmts = sqlStmts(storage.db);
	const parts = stmts.getPartsByUploadId.all(upload.uploadId);
	t.is(parts.length, 3);
	await r2.delete("key");
	t.is(
		await objectBody1?.text(),
		`${"1".repeat(PART_SIZE)}${"2".repeat(PART_SIZE)}${"3".repeat(PART_SIZE)}`
	);
	t.is(
		await objectBody2?.text(),
		`${"2".repeat(PART_SIZE)}${"3".repeat(PART_SIZE)}`
	);

	await timers.waitForTasks();
	for (const part of parts) t.is(await storage.blob.get(part.blob_id), null);
});
test("list: is multipart aware", async (t) => {
	const { r2, ns } = t.context;

	// Check returns nothing for in-progress multipart upload
	const upload = await r2.createMultipartUpload("key", {
		customMetadata: { key: "value" },
		httpMetadata: { contentType: "text/plain" },
	});
	const part1 = await upload.uploadPart(1, "x".repeat(PART_SIZE));
	const part2 = await upload.uploadPart(2, "y".repeat(PART_SIZE));
	const part3 = await upload.uploadPart(3, "z".repeat(PART_SIZE));
	let { objects } = await r2.list({
		prefix: ns,
		include: ["httpMetadata", "customMetadata"],
	});
	t.is(objects.length, 0);

	// Check returns metadata for completed upload
	const completed = await upload.complete([part1, part2, part3]);
	({ objects } = await r2.list({
		prefix: ns,
		include: ["httpMetadata", "customMetadata"],
	}));
	t.is(objects.length, 1);
	const object = objects[0];
	t.is(object?.key, `${ns}key`);
	t.is(object?.version, completed.version);
	t.is(object?.size, 3 * PART_SIZE);
	t.is(object?.etag, "9f4271a2af6d83c1d3fef1cc6d170f9f-3");
	t.is(object?.httpEtag, '"9f4271a2af6d83c1d3fef1cc6d170f9f-3"');
	t.is(object?.range, undefined);
	t.deepEqual(object?.checksums.toJSON(), {});
	t.deepEqual(object?.customMetadata, { key: "value" });
	t.deepEqual(object?.httpMetadata, { contentType: "text/plain" });
});
