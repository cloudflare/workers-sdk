import assert from "node:assert";
import { Blob } from "node:buffer";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { ReadableStream } from "node:stream/web";
import anyTest, { TestFn } from "ava";
import { InclusiveRange, Miniflare, Response } from "miniflare";
import { useTmp } from "../test-shared";

class BlobStoreStub {
	constructor(private readonly mf: Miniflare) {}

	get(
		id: string,
		ranges?: InclusiveRange | InclusiveRange[],
		opts?: { contentType: string }
	): Promise<Response> {
		return this.mf.dispatchFetch("http://placeholder", {
			method: "POST", // ish
			body: JSON.stringify([id, ranges, opts]),
		});
	}

	async put(stream: ReadableStream<Uint8Array>): Promise<string> {
		const res = await this.mf.dispatchFetch("http://placeholder", {
			method: "PUT",
			body: stream,
			duplex: "half",
		});
		return res.text();
	}

	async delete(id: string): Promise<void> {
		await this.mf.dispatchFetch("http://placeholder", {
			method: "DELETE",
			body: id,
		});
	}
}

const NAMESPACE = " strange%/namespace \\";

interface Context {
	tmp: string;
	mf: Miniflare;
	store: BlobStoreStub;
}

const test = anyTest as TestFn<Context>;

// Can't use `miniflareTest` here as we want to import from "miniflare:shared".
// Can't use dynamic import as `esbuild` will still try to bundle it/apply
// format conversion to CJS.
// Can't use proxy client here as the blob store isn't accessible as a binding.
// Could do with wrapped bindings support though once implemented :eyes: .
test.before(async (t) => {
	const tmp = await useTmp(t);
	t.context.tmp = tmp;
	t.context.mf = new Miniflare({
		bindings: { NAMESPACE },
		serviceBindings: { BLOBS: { disk: { path: tmp, writable: true } } },
		compatibilityDate: "2023-08-01",
		compatibilityFlags: ["nodejs_compat"],
		modules: [
			{
				type: "ESModule",
				path: "blob.js",
				contents: `
        import { BlobStore } from "miniflare:shared";
        export default {
          async fetch(request, env, ctx) {
            const store = new BlobStore(env.BLOBS, env.NAMESPACE, false);
            if (request.method === "POST") {
              let args = await request.json();
              args = args.map((arg) => arg === null ? undefined : arg);
              const result = await store.get(...args);
              if (result instanceof ReadableStream) {
                return new Response(result, { duplex: "half" });
              } else if (result !== null) {
                return new Response(result.body, {
                  headers: { "Content-Type": result.multipartContentType },
                  duplex: "half",
                });
              } else {
                return new Response(null, { status: 404 });
              }
            } else if (request.method === "PUT") {
              return new Response(await store.put(request.body))
            } else if (request.method === "DELETE") {
              await store.delete(await request.text());
              return new Response(null, { status: 204 });
            } else {
              return new Response(null, { status: 405 });
            }
          }
        }`,
			},
		],
	});
	t.context.store = new BlobStoreStub(t.context.mf);
});
test.after((t) => t.context.mf.dispose());

test("BlobStore: put/get", async (t) => {
	const { tmp, store } = t.context;

	// Check put writes file to correct location
	const id = await store.put(new Blob(["0123456789"]).stream());
	const namespacePath = path.join(tmp, "_strange%_namespace _");
	const blobsPath = path.join(namespacePath, "blobs");
	t.is(await fs.readFile(path.join(blobsPath, id), "utf8"), "0123456789");

	// Check full range
	let res = await store.get(id);
	t.true(res.ok);
	t.is(await res.text(), "0123456789");

	// Check single range
	res = await store.get(id, { start: 3, end: 7 });
	t.true(res.ok);
	t.is(await res.text(), "34567");

	// Check multiple ranges with no content type
	res = await store.get(id, [
		{ start: 5, end: 7 },
		{ start: 8, end: 8 },
	]);
	t.true(res.ok);
	let contentTypeHeader = res.headers.get("Content-Type");
	assert(contentTypeHeader !== null);
	let [contentType, boundary] = contentTypeHeader.split("=");
	t.is(contentType, "multipart/byteranges; boundary");
	let actualText = await res.text();
	let expectedText = [
		`--${boundary}`,
		"Content-Range: bytes 5-7/10",
		"",
		"567",
		`--${boundary}`,
		"Content-Range: bytes 8-8/10",
		"",
		"8",
		`--${boundary}--`,
	].join("\r\n");
	t.is(actualText, expectedText);

	// Check multiple ranges with content type
	res = await store.get(
		id,
		[
			{ start: 1, end: 3 },
			{ start: 5, end: 6 },
			{ start: 0, end: 0 }, // (out of order)
			{ start: 9, end: 9 },
		],
		{ contentType: "text/plain" }
	);
	t.true(res.ok);
	contentTypeHeader = res.headers.get("Content-Type");
	assert(contentTypeHeader !== null);
	[contentType, boundary] = contentTypeHeader.split("=");
	t.is(contentType, "multipart/byteranges; boundary");
	actualText = await res.text();
	expectedText = [
		`--${boundary}`,
		"Content-Type: text/plain",
		"Content-Range: bytes 1-3/10",
		"",
		"123",
		`--${boundary}`,
		"Content-Type: text/plain",
		"Content-Range: bytes 5-6/10",
		"",
		"56",
		`--${boundary}`,
		"Content-Type: text/plain",
		"Content-Range: bytes 0-0/10",
		"",
		"0",
		`--${boundary}`,
		"Content-Type: text/plain",
		"Content-Range: bytes 9-9/10",
		"",
		"9",
		`--${boundary}--`,
	].join("\r\n");
	t.is(actualText, expectedText);

	// Check multiple ranges with no ranges
	res = await store.get(id, []);
	t.true(res.ok);
	contentTypeHeader = res.headers.get("Content-Type");
	assert(contentTypeHeader !== null);
	[contentType, boundary] = contentTypeHeader.split("=");
	t.is(contentType, "multipart/byteranges; boundary");
	actualText = await res.text();
	expectedText = `--${boundary}--`;
	t.is(actualText, expectedText);

	// Check getting invalid ID returns null
	res = await store.get("bad");
	t.is(res.status, 404);
	await res.arrayBuffer(); // (drain)

	// Check getting invalid ID with multiple ranges returns null
	res = await store.get("bad", [
		{ start: 1, end: 2 },
		{ start: 3, end: 4 },
	]);
	t.is(res.status, 404);
	await res.arrayBuffer(); // (drain)

	// Check getting ID outside root returns null
	await fs.writeFile(path.join(namespacePath, "secrets.txt"), "password123");
	res = await store.get("../secrets.txt");
	t.is(res.status, 404);
	await res.arrayBuffer(); // (drain)
});

test("BlobStore: delete", async (t) => {
	const { tmp, store } = t.context;

	// Check delete removes blob
	let id = await store.put(new Blob(["value"]).stream());
	let res = await store.get(id);
	t.true(res.ok);
	await res.arrayBuffer(); // (drain)
	await store.delete(id);
	res = await store.get(id);
	t.is(res.status, 404);
	await res.arrayBuffer(); // (drain)

	// Check delete whilst getting still returns value
	id = await store.put(new Blob(["value"]).stream());
	// (intentionally not consuming body immediately here)
	const originalAssertConsumed = process.env.MINIFLARE_ASSERT_BODIES_CONSUMED;
	process.env.MINIFLARE_ASSERT_BODIES_CONSUMED = undefined;
	res = await store.get(id);
	process.env.MINIFLARE_ASSERT_BODIES_CONSUMED = originalAssertConsumed;
	t.true(res.ok);
	await store.delete(id);
	t.is(await res.text(), "value");

	// Check deleting invalid ID does nothing
	await store.delete("whoops");

	// Check deleting ID outside root does nothing
	const importantPath = path.join(tmp, "unicorn.txt");
	await fs.writeFile(importantPath, "❤️🦄");
	await store.delete("../../unicorn.txt");
	await store.delete("dir/../../../unicorn.txt");
	t.true(existsSync(importantPath));
});
