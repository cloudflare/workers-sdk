import assert from "assert";
import { Blob } from "buffer";
import { existsSync } from "fs";
import fs from "fs/promises";
import path from "path";
import { arrayBuffer, text } from "stream/consumers";
import test, { ExecutionContext, Macro } from "ava";
import { BlobStore, FileBlobStore, MemoryBlobStore } from "miniflare";
import { useTmp } from "../../test-shared";

type BlobStoreFactory = (t: ExecutionContext) => Promise<BlobStore>;
const MemoryBlobStoreFactory: BlobStoreFactory = async () =>
	new MemoryBlobStore();
const FileBlobStoreFactory: BlobStoreFactory = async (t) => {
	const tmp = await useTmp(t);
	return new FileBlobStore(tmp);
};

const getMacro: Macro<[BlobStoreFactory]> = {
	async exec(t, factory) {
		const store = await factory(t);
		const id = await store.put(new Blob(["0123456789"]).stream());

		// Check full range
		let stream = await store.get(id);
		assert(stream !== null);
		t.is(await text(stream), "0123456789");

		// Check single range
		stream = await store.get(id, { start: 3, end: 7 });
		assert(stream !== null);
		t.is(await text(stream), "34567");

		// Check multiple ranges
		const multipartStream = await store.get(
			id,
			[
				{ start: 1, end: 3 },
				{ start: 5, end: 6 },
				{ start: 9, end: 9 },
			],
			{
				contentLength: 10,
				contentType: "text/plain",
			}
		);
		assert(multipartStream !== null);
		const [contentType, boundary] =
			multipartStream.multipartContentType.split("=");
		t.is(contentType, "multipart/byteranges; boundary");
		const actualText = await text(multipartStream.body);
		const expectedText = [
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
			"Content-Range: bytes 9-9/10",
			"",
			"9",
			`--${boundary}--`,
		].join("\r\n");
		t.is(actualText, expectedText);

		// Check getting invalid ID returns null
		stream = await store.get("bad");
		t.is(stream, null);
	},
};
test("MemoryBlobStore: get", getMacro, MemoryBlobStoreFactory);
test("FileBlobStore: get", getMacro, FileBlobStoreFactory);
test("FileBlobStore: get: file-system specific functionality", async (t) => {
	const tmp = await useTmp(t);
	await fs.writeFile(path.join(tmp, "secrets.txt"), "password123");
	const root = path.join(tmp, "root");
	const store = new FileBlobStore(root);

	// Check getting ID outside root returns null
	let stream = await store.get("../secrets.txt");
	t.is(stream, null);

	// Check with non-standard nested blob IDs used by Workers Sites
	const subPath = path.join(root, "a", "b", "c");
	await fs.mkdir(subPath, { recursive: true });
	await fs.writeFile(path.join(subPath, "test.txt"), "thing");
	stream = await store.get("a/b/c/test.txt");
	assert(stream !== null);
	t.is(await text(stream), "thing");
});

const putMacro: Macro<[BlobStoreFactory]> = {
	async exec(t, factory) {
		const store = await factory(t);
		const id = await store.put(new Blob(["value"]).stream());
		const value = await store.get(id);
		assert(value !== null);
		t.is(await text(value), "value");
	},
};
test("MemoryBlobStore: put", putMacro, MemoryBlobStoreFactory);
test("FileBlobStore: put", putMacro, FileBlobStoreFactory);
test("FileBlobStore: put: file-system specific functionality", async (t) => {
	const tmp = await useTmp(t);
	const root = path.join(tmp, "root");
	const store = new FileBlobStore(root);

	// Check created file is read-only
	const id = await store.put(new Blob(["😈"]).stream());
	const filePath = path.join(root, id);
	await t.throwsAsync(fs.writeFile(filePath, "new"), {
		code: process.platform === "win32" ? "EPERM" : "EACCES",
	});
});

const deleteMacro: Macro<[BlobStoreFactory]> = {
	async exec(t, factory) {
		const store = await factory(t);

		// Check delete removes blob
		let id = await store.put(new Blob(["value"]).stream());
		let value = await store.get(id);
		assert(value !== null);
		await arrayBuffer(value); // (drain)
		await store.delete(id);
		value = await store.get(id);
		t.is(value, null);

		// Check delete whilst getting still returns value
		id = await store.put(new Blob(["value"]).stream());
		value = await store.get(id);
		assert(value !== null);
		await store.delete(id);
		t.is(await text(value), "value");

		// Check deleting invalid ID does nothing
		await store.delete("whoops");
	},
};
test("MemoryBlobStore: delete", deleteMacro, MemoryBlobStoreFactory);
test("FileBlobStore: delete", deleteMacro, FileBlobStoreFactory);
test("FileBlobStore: delete: file-system specific functionality", async (t) => {
	const tmp = await useTmp(t);
	const root = path.join(tmp, "root");
	const store = new FileBlobStore(root);

	// Check deleting ID outside root does nothing
	const importantPath = path.join(tmp, "unicorn.txt");
	await fs.writeFile(importantPath, "❤️🦄");
	await store.delete("../unicorn.txt");
	await store.delete("dir/../../unicorn.txt");
	t.true(existsSync(importantPath));
});
