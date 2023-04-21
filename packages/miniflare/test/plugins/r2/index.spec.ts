import assert from "assert";
import { Blob } from "buffer";
import crypto from "crypto";
import path from "path";
import { blob } from "stream/consumers";
import { ReadableStream } from "stream/web";
import type {
	R2Bucket,
	R2Checksums,
	R2Conditional,
	R2GetOptions,
	R2HTTPMetadata,
	R2ListOptions,
	R2MultipartOptions,
	R2MultipartUpload,
	R2Object,
	R2ObjectBody,
	R2Objects,
	R2PutOptions,
	R2Range,
	R2StringChecksums,
	Blob as WorkerBlob,
	Headers as WorkerHeaders,
	Response as WorkerResponse,
} from "@cloudflare/workers-types/experimental";
import {
	File,
	FileStorage,
	FormData,
	Headers,
	Miniflare,
	MiniflareOptions,
	Response,
	viewToArray,
	viewToBuffer,
} from "@miniflare/tre";
import { Macro, ThrowsExpectation } from "ava";
import { z } from "zod";
import { MiniflareTestContext, miniflareTest, useTmp } from "../../test-shared";
import { isWithin } from "../../test-shared/asserts";

const WITHIN_EPSILON = 10_000;

function hash(value: string, algorithm = "md5") {
	return crypto.createHash(algorithm).update(value).digest("hex");
}

// R2-like API for sending requests to the test worker. These tests were
// ported from Miniflare 2, which provided this API natively.

type ReducedR2Object = Omit<
	R2Object,
	"checksums" | "uploaded" | "writeHttpMetadata"
> & { checksums: R2StringChecksums; uploaded: string };
type ReducedR2ObjectBody = ReducedR2Object & { body: number };

async function deconstructResponse(res: Response): Promise<any> {
	const formData = await res.formData();
	const payload = formData.get("payload");
	assert(typeof payload === "string");
	return JSON.parse(payload, (key, value) => {
		if (typeof value === "object" && value !== null && "$type" in value) {
			if (value.$type === "R2Object") {
				const object = value as ReducedR2Object;
				return new TestR2Object(object);
			} else if (value.$type === "R2ObjectBody") {
				const objectBody = value as ReducedR2ObjectBody;
				const body = formData.get(objectBody.body.toString());
				// noinspection SuspiciousTypeOfGuard
				assert(body instanceof File);
				return new TestR2ObjectBody(objectBody, body);
			} else if (value.$type === "Date") {
				return new Date(value.value);
			}
			// TODO: multipart upload
		}
		return value;
	});
}

function maybeJsonStringify(value: unknown): string {
	if (value == null) return "";
	return JSON.stringify(value, (key, value) => {
		const dateResult = z.string().datetime().safeParse(value);
		if (dateResult.success) {
			return { $type: "Date", value: new Date(dateResult.data).getTime() };
		}
		if (value instanceof Headers) {
			return { $type: "Headers", entries: [...value] };
		}
		return value;
	});
}

class TestR2Bucket implements R2Bucket {
	constructor(
		private readonly mf: Miniflare,
		private readonly ns = ""
	) {}

	async head(key: string): Promise<R2Object | null> {
		const url = new URL(this.ns + key, "http://localhost");
		const res = await this.mf.dispatchFetch(url, {
			method: "GET",
			headers: {
				Accept: "multipart/form-data",
				"Test-Method": "HEAD",
			},
		});
		return deconstructResponse(res);
	}

	get(
		key: string,
		options: R2GetOptions & {
			onlyIf: R2Conditional | Headers;
		}
	): Promise<R2ObjectBody | R2Object | null>;
	get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>;
	async get(
		key: string,
		options?: R2GetOptions
	): Promise<R2ObjectBody | R2Object | null> {
		const url = `http://localhost/${encodeURIComponent(this.ns + key)}`;
		const res = await this.mf.dispatchFetch(url, {
			method: "GET",
			headers: {
				Accept: "multipart/form-data",
				"Test-Options": maybeJsonStringify(options),
			},
		});
		return deconstructResponse(res);
	}

	// @ts-expect-error `@cloudflare/workers-type`'s `ReadableStream` type is
	//  incompatible with Node's
	async put(
		key: string,
		value:
			| ReadableStream
			| ArrayBuffer
			| ArrayBufferView
			| string
			| null
			| Blob,
		options?: R2PutOptions
	): Promise<R2Object> {
		const url = `http://localhost/${encodeURIComponent(this.ns + key)}`;

		let valueBlob: Blob;
		if (value === null) {
			valueBlob = new Blob([]);
		} else if (value instanceof ArrayBuffer) {
			valueBlob = new Blob([new Uint8Array(value)]);
		} else if (ArrayBuffer.isView(value)) {
			valueBlob = new Blob([viewToArray(value)]);
		} else if (value instanceof ReadableStream) {
			valueBlob = await blob(value);
		} else {
			valueBlob = new Blob([value]);
		}

		// We can't store options in headers as some put() tests include extended
		// characters in them, and `undici` validates all headers are byte strings,
		// so use a form data body instead
		const formData = new FormData();
		formData.set("options", maybeJsonStringify(options));
		formData.set("value", valueBlob);
		const res = await this.mf.dispatchFetch(url, {
			method: "PUT",
			headers: { Accept: "multipart/form-data" },
			body: formData,
		});
		return deconstructResponse(res);
	}

	async delete(keys: string | string[]): Promise<void> {
		if (Array.isArray(keys)) keys = keys.map((key) => this.ns + key);
		else keys = this.ns + keys;
		await this.mf.dispatchFetch("http://localhost", {
			method: "DELETE",
			body: JSON.stringify(keys),
			headers: { Accept: "multipart/form-data" },
		});
	}

	async list(options?: R2ListOptions): Promise<R2Objects> {
		const res = await this.mf.dispatchFetch("http://localhost", {
			method: "GET",
			headers: {
				Accept: "multipart/form-data",
				"Test-Method": "LIST",
				"Test-Options": maybeJsonStringify(options),
			},
		});
		return deconstructResponse(res);
	}

	createMultipartUpload(
		_key: string,
		_options?: R2MultipartOptions
	): Promise<R2MultipartUpload> {
		assert.fail("TestR2Bucket#createMultipartUpload() not yet implemented");
	}

	resumeMultipartUpload(_key: string, _uploadId: string): R2MultipartUpload {
		assert.fail("TestR2Bucket#resumeMultipartUpload() not yet implemented");
	}
}

class TestR2Checksums implements R2Checksums {
	readonly md5?: ArrayBuffer;
	readonly sha1?: ArrayBuffer;
	readonly sha256?: ArrayBuffer;
	readonly sha384?: ArrayBuffer;
	readonly sha512?: ArrayBuffer;

	constructor(private readonly checksums: R2StringChecksums) {
		this.md5 = this.#decode(checksums.md5);
		this.sha1 = this.#decode(checksums.sha1);
		this.sha256 = this.#decode(checksums.sha256);
		this.sha384 = this.#decode(checksums.sha384);
		this.sha512 = this.#decode(checksums.sha512);
	}

	#decode(checksum?: string) {
		return checksum === undefined
			? undefined
			: viewToBuffer(Buffer.from(checksum, "hex"));
	}

	toJSON(): R2StringChecksums {
		return this.checksums;
	}
}

class TestR2Object implements R2Object {
	readonly key: string;
	readonly version: string;
	readonly size: number;
	readonly etag: string;
	readonly httpEtag: string;
	readonly checksums: R2Checksums;
	readonly uploaded: Date;
	readonly httpMetadata?: R2HTTPMetadata;
	readonly customMetadata?: Record<string, string>;
	readonly range?: R2Range;

	constructor(object: ReducedR2Object) {
		this.key = object.key;
		this.version = object.version;
		this.size = object.size;
		this.etag = object.etag;
		this.httpEtag = object.httpEtag;
		this.checksums = new TestR2Checksums(object.checksums);
		this.uploaded = new Date(object.uploaded);
		this.httpMetadata = object.httpMetadata;
		this.customMetadata = object.customMetadata;
		this.range = object.range;
	}

	writeHttpMetadata(_headers: Headers): void {
		// Fully-implemented by `workerd`
		assert.fail("TestR2Object#writeHttpMetadata() not implemented");
	}
}

class TestR2ObjectBody extends TestR2Object implements R2ObjectBody {
	constructor(
		object: ReducedR2Object,
		readonly body: Blob
	) {
		super(object);
	}

	get bodyUsed(): boolean {
		// Fully-implemented by `workerd`
		assert.fail("TestR2Object#writeHttpMetadata() not implemented");
		return false; // TypeScript requires `get` accessors return
	}

	arrayBuffer(): Promise<ArrayBuffer> {
		return this.body.arrayBuffer();
	}
	text(): Promise<string> {
		return this.body.text();
	}
	async json<T>(): Promise<T> {
		return JSON.parse(await this.body.text());
	}
	// @ts-expect-error `@cloudflare/workers-type`'s `Blob` type is incompatible
	//  with Node's
	blob(): Promise<Blob> {
		return Promise.resolve(this.body);
	}
}

interface Context extends MiniflareTestContext {
	ns: string;
	r2: TestR2Bucket;
}

const opts: Partial<MiniflareOptions> = {
	r2Buckets: { BUCKET: "bucket" },
	compatibilityFlags: ["r2_list_honor_include"],
};
const test = miniflareTest<{ BUCKET: R2Bucket }, Context>(
	opts,
	async (global, request, env) => {
		function maybeJsonParse(value: string | null): any {
			if (value === null || value === "") return;
			return JSON.parse(value, (key, value) => {
				if (typeof value === "object" && value !== null && "$type" in value) {
					if (value.$type === "Date") {
						return new Date(value.value);
					}
					if (value.$type === "Headers") {
						return new global.Headers(value.entries);
					}
				}
				return value;
			});
		}

		function reduceR2Object(
			value: R2Object
		): ReducedR2Object & { $type: "R2Object" } {
			return {
				$type: "R2Object",
				key: value.key,
				version: value.version,
				size: value.size,
				etag: value.etag,
				httpEtag: value.httpEtag,
				checksums: value.checksums.toJSON(),
				uploaded: value.uploaded.toISOString(),
				httpMetadata: value.httpMetadata,
				customMetadata: value.customMetadata,
				range: value.range,
			};
		}
		async function constructResponse(thing: any): Promise<WorkerResponse> {
			// Stringify `thing` as JSON, replacing `R2Object(Body)`s with a
			// plain-object representation. Reading bodies is asynchronous, but
			// `JSON.stringify`-replacers must be synchronous, so record body
			// reading `Promise`s, and attach the bodies in `FormData`.
			const bodyPromises: Promise<WorkerBlob>[] = [];
			const payload = JSON.stringify(thing, (key, value) => {
				if (typeof value === "object" && value !== null) {
					// https://github.com/cloudflare/workerd/blob/c336d404a5fbe2c779b28a6ca54c338f89e2fea1/src/workerd/api/r2-bucket.h#L202
					if (value.constructor?.name === "HeadResult" /* R2Object */) {
						const object = value as R2Object;
						return reduceR2Object(object);
					}
					// https://github.com/cloudflare/workerd/blob/c336d404a5fbe2c779b28a6ca54c338f89e2fea1/src/workerd/api/r2-bucket.h#L255
					if (value.constructor?.name === "GetResult" /* R2ObjectBody */) {
						const objectBody = value as R2ObjectBody;
						const object = reduceR2Object(objectBody);
						const bodyId = bodyPromises.length;
						// Test bodies shouldn't be too big, so buffering them is fine
						bodyPromises.push(objectBody.blob());
						return { ...object, $type: "R2ObjectBody", body: bodyId };
					}
					// TODO: R2MultipartUpload
				}

				if (
					typeof value === "string" &&
					// https://github.com/colinhacks/zod/blob/981af6503ee1be530fe525ac77ba95e1904ce24a/src/types.ts#L562
					/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value)
				) {
					return { $type: "Date", value: new Date(value).getTime() };
				}

				return value;
			});

			// Construct `FormData` containing JSON-payload and all bodies
			const formData = new global.FormData();
			formData.set("payload", payload);
			const bodies = await Promise.all(bodyPromises);
			bodies.forEach((body, i) => formData.set(i.toString(), body));

			return new global.Response(formData);
		}

		// Actual `HEAD` requests can't return bodies, but we'd like them to.
		// Also, `LIST` is not a valid HTTP method.
		const method = request.headers.get("Test-Method") ?? request.method;
		const { pathname } = new URL(request.url);
		const key = decodeURIComponent(pathname.substring(1));
		if (method === "HEAD") {
			return constructResponse(await env.BUCKET.head(key));
		} else if (method === "GET") {
			const optionsHeader = request.headers.get("Test-Options");
			const options = maybeJsonParse(optionsHeader);
			return constructResponse(await env.BUCKET.get(key, options));
		} else if (method === "PUT") {
			const formData = await request.formData();
			const optionsData = formData.get("options");
			if (typeof optionsData !== "string") throw new TypeError();
			const options = maybeJsonParse(optionsData);
			const value = formData.get("value");
			return constructResponse(await env.BUCKET.put(key, value, options));
		} else if (method === "DELETE") {
			const keys = await request.json<string | string[]>();
			await env.BUCKET.delete(keys);
			return new global.Response(null, { status: 204 });
		} else if (method === "LIST") {
			const optionsHeader = request.headers.get("Test-Options");
			const options = maybeJsonParse(optionsHeader);
			return constructResponse(await env.BUCKET.list(options));
		}

		return new global.Response(null, { status: 405 });
	}
);
test.beforeEach((t) => {
	// Namespace keys so tests which are accessing the same Miniflare instance
	// and bucket don't have races from key collisions
	const ns = `${Date.now()}_${Math.floor(
		Math.random() * Number.MAX_SAFE_INTEGER
	)}`;
	t.context.ns = ns;
	t.context.r2 = new TestR2Bucket(t.context.mf, ns);
});

const validatesKeyMacro: Macro<
	[
		{
			method: string;
			f: (r2: TestR2Bucket, key?: any) => Promise<unknown>;
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
	const range = new Headers() as WorkerHeaders;

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
		t.not(object, null);
		t.true(object instanceof TestR2ObjectBody);
	};
	const fail = async (cond: R2Conditional) => {
		const object = await r2.get("key", { onlyIf: cond });
		t.not(object, null);
		// Can't test if `object instanceof TestR2Object` as
		// `TestR2ObjectBody extends TestR2Object`
		t.false(object instanceof TestR2ObjectBody);
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
	const { r2 } = t.context;
	await r2.put("key", "value1");
	await r2.put("key", "value2");
	const body = await r2.get("key");
	assert(body !== null);
	t.is(await body.text(), "value2");
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

	// TODO(soon): add check for max value size once we have streaming support
	//  (don't really want to allocate 5GB buffers in tests :sweat_smile:)

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
	const { r2 } = t.context;

	// Check does nothing with non-existent key
	await r2.delete("key");

	// Check deletes single key
	await r2.put("key", "value");
	t.not(await r2.head("key"), null);
	await r2.delete("key");
	t.is(await r2.head("key"), null);

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
			const { objects, truncated, cursor } = await r2.list({
				...options,
				prefix: ns + (options?.prefix ?? ""),
				cursor: options?.cursor ?? lastCursor,
				startAfter: options?.startAfter ? ns + options.startAfter : undefined,
			});

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
	t.true(result.truncated);
	t.not(result.cursor, undefined);

	// Get second page with different limit
	result = await r2.list({ prefix: ns, limit: 2, cursor: result.cursor });
	t.is(result.objects.length, 2);
	t.is(result.objects[0].key, `${ns}key2`);
	t.is(result.objects[1].key, `${ns}key3`);
	t.false(result.truncated);
	t.is(result.cursor, undefined);
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
	t.true(result.truncated);
	t.not(result.cursor, undefined);

	// Insert key2 and key4
	await r2.put("key2", "value2");
	await r2.put("key4", "value4");

	// Get second page, expecting to see key4 but not key2
	result = await r2.list({ prefix: ns, limit: 2, cursor: result.cursor });
	t.is(result.objects.length, 2);
	t.is(result.objects[0].key, `${ns}key4`);
	t.is(result.objects[1].key, `${ns}key5`);
	t.false(result.truncated);
	t.is(result.cursor, undefined);
});
test("list: validates limit", async (t) => {
	const { r2 } = t.context;
	// R2 actually accepts 0 and -1 as valid limits, but this is probably a bug
	// TODO(now): report to R2 team
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
	t.true(result.truncated);
	t.deepEqual(keys(result), ["dir0/file0", "dir0/file1"]);
	t.deepEqual(delimitedPrefixes(result), []);
	result = await r2.list({ ...opt, cursor: result.cursor });
	t.false(result.truncated);
	t.deepEqual(keys(result), []);
	t.deepEqual(delimitedPrefixes(result), ["dir0/sub0/", "dir0/sub1/"]);
});

test.serial("operations persist stored data", async (t) => {
	const { r2, ns } = t.context;

	// Create new temporary file-system persistence directory
	const tmp = await useTmp(t);
	const legacyStorage = new FileStorage(path.join(tmp, "bucket"));
	const newStorage = legacyStorage.getNewStorage();

	// Set option, then reset after test
	await t.context.setOptions({ ...opts, r2Persist: tmp });
	t.teardown(() => t.context.setOptions(opts));

	// Check put respects persist
	await r2.put("key", "value");
	const stmtListByNs = newStorage.db.prepare<{ ns: string }, { key: string }>(
		"SELECT key FROM _mf_objects WHERE key LIKE :ns || '%'"
	);
	let stored = stmtListByNs.all({ ns });
	t.deepEqual(stored, [{ key: `${ns}key` }]);

	// Check head respects persist
	const object = await r2.head("key");
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
});

// TODO: add tests for empty key
