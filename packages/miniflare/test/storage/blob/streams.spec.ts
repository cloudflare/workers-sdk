import assert, { AssertionError } from "assert";
import fs from "fs/promises";
import path from "path";
import { arrayBuffer } from "stream/consumers";
import { TextEncoderStream } from "stream/web";
import {
	createArrayReadableStream,
	createFileReadableStream,
	createFileWritableStream,
	createMultipartArrayReadableStream,
	createMultipartFileReadableStream,
} from "@miniflare/tre";
import test, { Macro } from "ava";
import { useTmp, utf8Decode, utf8Encode } from "../../test-shared";

function arrayInit<T>(n: number, f: (i: number) => T): T[] {
	return Array.from(Array(n)).map((_, i) => f(i));
}
function concat(...arrays: Uint8Array[]): Uint8Array {
	// `Buffer`s are `Uint8Array`s, but for deep-equal, we need types to match
	return new Uint8Array(Buffer.concat(arrays));
}

// [0, 1, 2, ..., 255] (i.e. `singleData[i] === i`)
const singleData = new Uint8Array(arrayInit(256, (i) => i));
// [0, 0, 1, 1, 2, ..., 254, 255, 255]
const doubleData = new Uint8Array(arrayInit(512, (i) => Math.floor(i / 2)));
// // [0, 0, 0, 1, 1, 1, 2, ..., 254, 255, 255, 255]
const tripleData = new Uint8Array(arrayInit(768, (i) => Math.floor(i / 3)));
const testData = concat(singleData, doubleData, tripleData);

const readableMacro: Macro<[typeof createFileReadableStream]> = {
	async exec(t, f) {
		const tmp = await useTmp(t);
		const testPath = path.join(tmp, "test.txt");
		await fs.writeFile(testPath, testData);

		// Check with default reader
		let stream = await f(testPath);
		const reader = stream.getReader();
		t.deepEqual(
			(await reader.read()).value,
			// 256 + 512 + 256 (default auto-allocated buffer is 1024 bytes)
			concat(singleData, doubleData, tripleData.slice(0, 256))
		);
		t.deepEqual((await reader.read()).value, tripleData.slice(256));
		t.true((await reader.read()).done);

		// Check with BYOB reader
		stream = await f(testPath);
		let byobReader = stream.getReader({ mode: "byob" });
		let buffer = new ArrayBuffer(4);
		let result = await byobReader.read(new Uint8Array(buffer));
		assert(!result.done);
		t.deepEqual(result.value, new Uint8Array([0, 1, 2, 3]));
		buffer = result.value.buffer;
		result = await byobReader.read(new Uint8Array(buffer));
		assert(!result.done);
		t.deepEqual(result.value, new Uint8Array([4, 5, 6, 7]));
		await byobReader.cancel();

		// Check with range
		stream = await f(testPath, { start: 8, end: 20 });
		byobReader = stream.getReader({ mode: "byob" });
		buffer = new ArrayBuffer(8);
		result = await byobReader.read(new Uint8Array(buffer));
		assert(!result.done);
		t.deepEqual(result.value, new Uint8Array([8, 9, 10, 11, 12, 13, 14, 15]));
		buffer = result.value.buffer;
		result = await byobReader.read(new Uint8Array(buffer));
		assert(!result.done);
		t.deepEqual(result.value, new Uint8Array([16, 17, 18, 19, 20]));
		buffer = result.value.buffer;
		result = await byobReader.read(new Uint8Array(buffer));
		assert(result.done);

		// Check accepts single byte ranges
		stream = await f(testPath, { start: 0, end: 0 });
		t.deepEqual(new Uint8Array(await arrayBuffer(stream)), new Uint8Array([0]));
		stream = await f(testPath, { start: 7, end: 7 });
		t.deepEqual(new Uint8Array(await arrayBuffer(stream)), new Uint8Array([7]));

		// Check rejects invalid ranges
		await t.throwsAsync(f(testPath, { start: -1, end: 5 }), {
			instanceOf: AssertionError,
			message: "Invalid range: [-1,5]",
		});
		await t.throwsAsync(f(testPath, { start: 5, end: 3 }), {
			instanceOf: AssertionError,
			message: "Invalid range: [5,3]",
		});
	},
};

test(
	"createArrayReadableStream: streams contents from array",
	readableMacro,
	async (_testPath, range) => createArrayReadableStream(testData, range)
);
test(
	"createFileReadableStream: streams file contents from disk",
	readableMacro,
	createFileReadableStream
);
test("createFileReadableStream: rejects if file not found", async (t) => {
	const tmp = await useTmp(t);
	const badPath = path.join(tmp, "bad.txt");
	await t.throwsAsync(createFileReadableStream(badPath), { code: "ENOENT" });
});

const crlfArray = utf8Encode("\r\n");
const emptyArray = new Uint8Array();
// Returns concatenation of lines separated by CRLF sequences
function crlfLines(...lines: (string | Uint8Array)[]): Uint8Array {
	return concat(
		...lines.flatMap((line, i) => [
			// If line is a string, UTF-8 encode it, otherwise use as is...
			typeof line === "string" ? utf8Encode(line) : line,
			// ...then concat CRLF if this isn't the last line
			i < lines.length - 1 ? crlfArray : emptyArray,
		])
	);
}

const multipartMacro: Macro<[typeof createMultipartFileReadableStream]> = {
	async exec(t, f) {
		const tmp = await useTmp(t);
		const testPath = path.join(tmp, "test.txt");
		await fs.writeFile(testPath, testData);

		// Check with multiple (including single byte) ranges and default reader
		let stream = await f(
			testPath,
			[
				{ start: 5, end: 10 },
				{ start: 23, end: 29 },
				{ start: 0, end: 0 },
				{ start: 3, end: 3 },
			],
			{ contentLength: testData.byteLength }
		);
		let [contentType, boundary] = stream.multipartContentType.split("=");
		t.is(contentType, "multipart/byteranges; boundary");
		let actualArray = new Uint8Array(await arrayBuffer(stream.body));
		let expectedArray = crlfLines(
			`--${boundary}`,
			"Content-Range: bytes 5-10/1536",
			"",
			new Uint8Array([5, 6, 7, 8, 9, 10]),
			`--${boundary}`,
			"Content-Range: bytes 23-29/1536",
			"",
			new Uint8Array([23, 24, 25, 26, 27, 28, 29]),
			`--${boundary}`,
			"Content-Range: bytes 0-0/1536",
			"",
			new Uint8Array([0]),
			`--${boundary}`,
			"Content-Range: bytes 3-3/1536",
			"",
			new Uint8Array([3]),
			`--${boundary}--`
		);
		t.deepEqual(actualArray, expectedArray);

		// Check with single range and BYOB reader
		stream = await f(testPath, [{ start: 17, end: 20 }], {
			contentLength: testData.byteLength,
		});
		[contentType, boundary] = stream.multipartContentType.split("=");
		t.is(contentType, "multipart/byteranges; boundary");
		const byobReader = stream.body.getReader({ mode: "byob" });
		let buffer = new ArrayBuffer(128);

		let expected = `--${boundary}`;
		let result = await byobReader.read(
			new Uint8Array(buffer, 0, expected.length)
		);
		assert(!result.done);
		t.deepEqual(utf8Decode(result.value), expected);
		buffer = result.value.buffer;

		expected = `\r\nContent-Range: bytes 17-20/1536\r\n\r\n`;
		result = await byobReader.read(new Uint8Array(buffer, 0, expected.length));
		assert(!result.done);
		t.deepEqual(utf8Decode(result.value), expected);
		buffer = result.value.buffer;

		result = await byobReader.read(new Uint8Array(buffer, 0, 4));
		assert(!result.done);
		t.deepEqual(result.value, new Uint8Array([17, 18, 19, 20]));
		buffer = result.value.buffer;

		expected = `\r\n--${boundary}--`;
		result = await byobReader.read(new Uint8Array(buffer, 0, expected.length));
		assert(!result.done);
		t.deepEqual(utf8Decode(result.value), expected);
		buffer = result.value.buffer;

		result = await byobReader.read(new Uint8Array(buffer));
		assert(result.done);

		// Check with no ranges
		stream = await f(testPath, [], {
			contentLength: testData.byteLength,
		});
		[contentType, boundary] = stream.multipartContentType.split("=");
		t.is(contentType, "multipart/byteranges; boundary");
		actualArray = new Uint8Array(await arrayBuffer(stream.body));
		expectedArray = utf8Encode(`--${boundary}--`);
		t.deepEqual(actualArray, expectedArray);

		// Check rejects invalid ranges
		await t.throwsAsync(
			f(
				testPath,
				[
					{ start: 0, end: 3 },
					{ start: -1, end: 4 },
					{ start: 7, end: 9 },
				],
				{ contentLength: testData.byteLength }
			),
			{ instanceOf: AssertionError, message: "Invalid range: [-1,4]" }
		);
		await t.throwsAsync(
			f(testPath, [{ start: 16, end: 4 }], {
				contentLength: testData.byteLength,
			}),
			{ instanceOf: AssertionError, message: "Invalid range: [16,4]" }
		);

		// Check with content type
		stream = await f(
			testPath,
			[
				{ start: 4, end: 6 },
				{ start: 8, end: 9 },
			],
			{
				contentLength: testData.byteLength,
				contentType: "application/octet-stream",
			}
		);
		[contentType, boundary] = stream.multipartContentType.split("=");
		t.is(contentType, "multipart/byteranges; boundary");
		actualArray = new Uint8Array(await arrayBuffer(stream.body));
		expectedArray = crlfLines(
			`--${boundary}`,
			"Content-Type: application/octet-stream",
			"Content-Range: bytes 4-6/1536",
			"",
			new Uint8Array([4, 5, 6]),
			`--${boundary}`,
			"Content-Type: application/octet-stream",
			"Content-Range: bytes 8-9/1536",
			"",
			new Uint8Array([8, 9]),
			`--${boundary}--`
		);
		t.deepEqual(actualArray, expectedArray);
	},
};

test(
	"createMultipartArrayReadableStream: streams contents from array",
	multipartMacro,
	async (_testPath, ranges, opts) =>
		createMultipartArrayReadableStream(testData, ranges, opts)
);
test(
	"createMultipartFileReadableStream: streams file contents from disk",
	multipartMacro,
	createMultipartFileReadableStream
);
test("createMultipartFileReadableStream: rejects if file not found", async (t) => {
	const tmp = await useTmp(t);
	const badPath = path.join(tmp, "bad.txt");
	await t.throwsAsync(
		createMultipartFileReadableStream(badPath, [], { contentLength: 0 }),
		{ code: "ENOENT" }
	);
});

test("createFileWritableStream: streams file contents to disk", async (t) => {
	const tmp = await useTmp(t);
	const testPath = path.join(tmp, "test.txt");

	// Check writes file
	let stream = await createFileWritableStream(testPath);
	const writer = stream.getWriter();
	await writer.write(utf8Encode("abc"));
	await writer.write(utf8Encode("de"));
	await writer.write(utf8Encode("f"));
	await writer.close();
	t.is(await fs.readFile(testPath, "utf8"), "abcdef");

	// Check overwrites file
	stream = await createFileWritableStream(testPath);
	const encoderStream = new TextEncoderStream();
	const pipePromise = encoderStream.readable.pipeTo(stream);
	const stringWriter = encoderStream.writable.getWriter();
	await stringWriter.write("1");
	await stringWriter.write("23");
	await stringWriter.write("456");
	await stringWriter.close();
	await pipePromise;
	t.is(await fs.readFile(testPath, "utf8"), "123456");

	// Check fails to overwrite file with exclusive flag
	await t.throwsAsync(createFileWritableStream(testPath, true), {
		code: "EEXIST",
	});
});

test("createFileReadableStream/createFileWritableStream: copies file", async (t) => {
	const tmp = await useTmp(t);
	const testPath = path.join(tmp, "test.txt");
	const copyPath = path.join(tmp, "copy.txt");
	await fs.writeFile(testPath, testData);

	const readableStream = await createFileReadableStream(testPath);
	const writableStream = await createFileWritableStream(copyPath);
	await readableStream.pipeTo(writableStream);

	const copyData = await fs.readFile(copyPath);
	t.deepEqual(new Uint8Array(copyData), testData);
});
