import assert from "node:assert";

import { parseHttpResponse } from "../../../src/workers/cache/cache.worker";
import { createTestHandler } from "../worker-test";

const ENCODER = new TextEncoder();

function createChunkedStream(chunks: string[]) {
	return new ReadableStream<Uint8Array>({
		pull(controller) {
			const chunk = chunks.shift();
			if (chunk === undefined) {
				controller.close();
			} else {
				controller.enqueue(ENCODER.encode(chunk));
			}
		},
	});
}

async function reduceResponse(res: Response) {
	return {
		status: res.status,
		statusText: res.statusText,
		headers: Object.fromEntries(res.headers),
		body: await res.text(),
	};
}

async function test() {
	// Check with `Transfer-Encoding: chunked` as last header
	let chunks = [
		"HTTP/1.1 200 OK\r\n",
		"Content-Type: text/plain\r",
		"\nTransfer-Encoding: chunked\r\n",
		"\r\nabc",
		"def",
		"ghi",
	];
	let res = await parseHttpResponse(createChunkedStream(chunks));
	assert.deepStrictEqual(await reduceResponse(res), {
		status: 200,
		statusText: "OK",
		headers: { "content-type": "text/plain", "transfer-encoding": "chunked" },
		body: "abcdefghi",
	});

	// Check with `Transfer-Encoding: chunked` split over multiple chunks
	chunks = [
		"HTTP/1 200 OK\r\n", // ...and check using version without dot
		"Transfer-",
		"Encoding: chun",
		"ked\r",
		"\nContent-Type: text/html\r",
		"\n\r\nabc",
		"def",
		"ghi",
	];
	res = await parseHttpResponse(createChunkedStream(chunks));
	assert.deepStrictEqual(await reduceResponse(res), {
		status: 200,
		statusText: "OK",
		headers: { "content-type": "text/html", "transfer-encoding": "chunked" },
		body: "abcdefghi",
	});

	// Check without `Transfer-Encoding: chunked`
	chunks = [
		"HTTP/1.1 200 OK\r\n",
		"Content-Type: text/xml\r\n\r\n",
		"abc",
		"def",
		"ghi",
	];
	res = await parseHttpResponse(createChunkedStream(chunks));
	assert.deepStrictEqual(await reduceResponse(res), {
		status: 200,
		statusText: "OK",
		headers: { "content-type": "text/xml" },
		body: "abcdefghi",
	});

	// Check with end-of-headers split over multiple chunks
	chunks = [
		"HTTP/1.1 200 OK\r\n",
		"Content-Type: text/plain\r",
		"\nTransfer-Encoding: chunked\r",
		"\n\r",
		"\nabc",
		"def",
		"ghi",
	];
	res = await parseHttpResponse(createChunkedStream(chunks));
	assert.deepStrictEqual(await reduceResponse(res), {
		status: 200,
		statusText: "OK",
		headers: { "content-type": "text/plain", "transfer-encoding": "chunked" },
		body: "abcdefghi",
	});

	// Check without end-of-headers (this shouldn't ever happen)
	chunks = [
		"HTTP/1.1 200 OK\r\n",
		"Content-Type: text/plain\r",
		"\nTransfer-Encoding: chunked\r\n",
	];
	await assert.rejects(parseHttpResponse(createChunkedStream(chunks)), {
		message: "Expected to find blank line in HTTP message",
	});

	// Check with HTTP messages sent by `workerd` (obtained by setting `workerd`'s
	// `cacheApiOutbound` to an external `nc -l` service)
	// TODO(someday): maybe use `workerd test` for these tests instead, and
	//  actually set `cacheApiOutbound` to the test service
	chunks = [
		"HTTP/1.1 200 OK\r\n",
		"Content-Length: 4\r\n",
		"Content-Type: text/plain;charset=UTF-8\r\n",
		"Cache-Control: max-age=3600\r\n",
		"\r\n",
		"body",
	];
	res = await parseHttpResponse(createChunkedStream(chunks));
	assert.deepStrictEqual(await reduceResponse(res), {
		status: 200,
		statusText: "OK",
		headers: {
			"content-length": "4",
			"content-type": "text/plain;charset=UTF-8",
			"cache-control": "max-age=3600",
		},
		body: "body",
	});
	chunks = [
		"HTTP/1.1 200 OK\r\n",
		"Transfer-Encoding: chunked\r\n",
		"Cache-Control: max-age=3600\r\n",
		"\r\n",
		"hi",
		"cache",
	];
	res = await parseHttpResponse(createChunkedStream(chunks));
	assert.deepStrictEqual(await reduceResponse(res), {
		status: 200,
		statusText: "OK",
		headers: {
			"transfer-encoding": "chunked",
			"cache-control": "max-age=3600",
		},
		body: "hicache",
	});
}

export default createTestHandler(test);
