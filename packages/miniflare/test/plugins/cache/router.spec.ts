import { Blob } from "buffer";
import net from "net";
import { arrayBuffer, text } from "stream/consumers";
import { ReadableStream } from "stream/web";
import {
	DeferredPromise,
	Response,
	_HttpParser,
	_RemoveTransformEncodingChunkedStream,
} from "@miniflare/tre";
import test from "ava";
import { useServer, utf8Encode } from "../../test-shared";

function createChunkedStream(chunks: string[]) {
	return new ReadableStream<Uint8Array>({
		pull(controller) {
			const chunk = chunks.shift();
			if (chunk === undefined) {
				controller.close();
			} else {
				controller.enqueue(utf8Encode(chunk));
			}
		},
	});
}

test('_RemoveTransformEncodingChunkedStream: removes "Transfer-Encoding: chunked" header', async (t) => {
	// Check with `Transfer-Encoding: chunked` as last header
	let chunks = [
		"HTTP/1.1 200 OK\r\n",
		"Content-Type: text/plain\r",
		"\nTransfer-Encoding: chunked\r\n",
		"\r\nabc",
		"def",
		"ghi",
	];
	let remover = new _RemoveTransformEncodingChunkedStream();
	let output = await text(createChunkedStream(chunks).pipeThrough(remover));
	t.is(output, "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nabcdefghi");

	// Check with `Transfer-Encoding: chunked` split over multiple chunks
	chunks = [
		"HTTP/1.1 200 OK\r\n",
		"Transfer-",
		"Encoding: chun",
		"ked\r",
		"\nContent-Type: text/html\r",
		"\n\r\nabc",
		"def",
		"ghi",
	];
	remover = new _RemoveTransformEncodingChunkedStream();
	output = await text(createChunkedStream(chunks).pipeThrough(remover));
	t.is(output, "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\nabcdefghi");

	// Check without `Transfer-Encoding: chunked`
	chunks = [
		"HTTP/1.1 200 OK\r\n",
		"Content-Type: text/xml\r\n\r\n",
		"abc",
		"def",
		"ghi",
	];
	remover = new _RemoveTransformEncodingChunkedStream();
	output = await text(createChunkedStream(chunks).pipeThrough(remover));
	t.is(output, "HTTP/1.1 200 OK\r\nContent-Type: text/xml\r\n\r\nabcdefghi");

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
	remover = new _RemoveTransformEncodingChunkedStream();
	output = await text(createChunkedStream(chunks).pipeThrough(remover));
	t.is(output, "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nabcdefghi");

	// Check without end-of-headers (this shouldn't ever happen)
	chunks = [
		"HTTP/1.1 200 OK\r\n",
		"Content-Type: text/plain\r",
		"\nTransfer-Encoding: chunked\r\n",
	];
	remover = new _RemoveTransformEncodingChunkedStream();
	output = await text(createChunkedStream(chunks).pipeThrough(remover));
	t.is(
		output,
		"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nTransfer-Encoding: chunked\r\n"
	);
});

test("_RemoveTransformEncodingChunkedStream/HttpParser: parses HTTP messages sent by workerd", async (t) => {
	// Obtained by setting `workerd`'s `cacheApiOutbound` to an external `nc -l` service
	const bufferedMessage = [
		"PUT / HTTP/1.1",
		"Content-Length: 111",
		"Host: localhost",
		"",
		"HTTP/1.1 200 OK",
		"Content-Length: 4",
		"Content-Type: text/plain;charset=UTF-8",
		"Cache-Control: max-age=3600",
		"",
		"body",
	].join("\r\n");
	const streamedMessage = [
		"PUT / HTTP/1.1",
		"Transfer-Encoding: chunked",
		"Host: localhost",
		"",
		"4c",
		"HTTP/1.1 200 OK",
		"Transfer-Encoding: chunked",
		"Cache-Control: max-age=3600",
		"",
		"",
		"2",
		"hi",
		"5",
		"cache",
		"0",
		"",
		"",
	].join("\r\n");

	let deferred: DeferredPromise<Response> | undefined;
	const server = await useServer(t, async (req, res) => {
		const array = new Uint8Array(await arrayBuffer(req));
		const stream = new Blob([array]).stream();
		const remover = new _RemoveTransformEncodingChunkedStream();
		const response = await _HttpParser.get().parse(stream.pipeThrough(remover));
		deferred?.resolve(response);
		res.end();
	});

	function parse(message: string) {
		deferred = new DeferredPromise();
		const socket = net.createConnection(
			{ host: server.http.hostname, port: parseInt(server.http.port) },
			() => {
				socket.write(message);
				socket.end();
			}
		);
		return deferred;
	}

	const bufferedResponse = await parse(bufferedMessage);
	t.is(bufferedResponse.headers.get("Cache-Control"), "max-age=3600");
	t.is(await bufferedResponse.text(), "body");

	const streamedResponse = await parse(streamedMessage);
	t.is(streamedResponse.headers.get("Cache-Control"), "max-age=3600");
	t.is(await streamedResponse.text(), "hicache");
});
