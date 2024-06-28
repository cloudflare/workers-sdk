import assert from "node:assert";
import { Buffer } from "node:buffer";
import { isMockActive, MockAgent, setDispatcher } from "cloudflare:mock-agent";
import type { Dispatcher } from "undici";

const DECODER = new TextDecoder();

// See public facing `cloudflare:test` types for docs
export const fetchMock = new MockAgent({ connections: 1 });

interface BufferedRequest {
	request: Request;
	body: Uint8Array | null;
}
const requests = new WeakMap<Dispatcher.DispatchOptions, BufferedRequest>();
const responses = new WeakMap<Dispatcher.DispatchOptions, Response>();

const originalFetch = fetch;
setDispatcher((opts, handler) => {
	const request = requests.get(opts);
	assert(request !== undefined, "Expected dispatch to come from fetch()");
	originalFetch
		.call(globalThis, request.request, { body: request.body })
		.then((response) => {
			responses.set(opts, response);
			assert(handler.onComplete !== undefined, "Expected onComplete() handler");
			handler.onComplete?.([]);
		})
		.catch((error) => {
			assert(handler.onError !== undefined, "Expected onError() handler");
			handler.onError(error);
		});
});

// Monkeypatch `fetch()` to intercept requests if the fetch mock is enabled.
//The way we've implemented this, `fetchMock` only mocks requests in the current
// worker. We kind of have to do it this way, as `fetchMock` supports functions
// as reply callbacks, and we can't serialise arbitrary functions across worker
// boundaries. For mocking requests in other workers, Miniflare's `fetchMock`
// option can be used in the `vitest.config.mts`.
globalThis.fetch = async (input, init) => {
	const isActive = isMockActive(fetchMock);
	if (!isActive) {
		return originalFetch.call(globalThis, input, init);
	}

	const request = new Request(input, init);
	const url = new URL(request.url);

	// Don't allow mocked `Upgrade` requests
	if (request.headers.get("Upgrade") !== null) {
		return originalFetch.call(globalThis, request);
	}

	// Convert headers into `undici` friendly format
	const requestHeaders: { "set-cookie"?: string[] } & Record<string, string> =
		{};
	for (const entry of request.headers) {
		const key = entry[0].toLowerCase();
		const value = entry[1];
		if (key === "set-cookie") {
			(requestHeaders[key] ??= []).push(value);
		} else {
			requestHeaders[key] = value;
		}
	}

	// Buffer body in case it needs to be matched against. Note `undici` only
	// supports matching against `string` bodies. To support binary bodies, we
	// buffer the body to a `Uint8Array`, then try to decode it. We pass the
	// decoded body via `DispatchOptions` for matching, then use the `Uint8Array`
	// body if the request falls-through to an actual `fetch()` call.
	const bodyArray =
		request.body === null ? null : new Uint8Array(await request.arrayBuffer());
	// Note `DECODER` doesn't have the `fatal: true` option enabled, so will
	// substitute invalid data with a replacement character
	const bodyText = bodyArray === null ? "" : DECODER.decode(bodyArray);
	const dispatchOptions: Dispatcher.DispatchOptions = {
		origin: url.origin,
		path: url.pathname,
		method: request.method as Dispatcher.HttpMethod,
		body: bodyText,
		headers: requestHeaders,
		query: Object.fromEntries(url.searchParams),
	};
	requests.set(dispatchOptions, { request, body: bodyArray });

	// If the response was mocked, record data as we receive it
	let responseStatusCode: number | undefined;
	let responseStatusText: string | undefined;
	let responseHeaders: string[][] | undefined;
	const responseChunks: Buffer[] = [];

	// Create deferred promise for response
	let responseResolve: (response: Response) => void;
	let responseReject: (error: Error) => void;
	const responsePromise = new Promise<Response>((resolve, reject) => {
		responseResolve = resolve;
		responseReject = reject;
	});

	// Dispatch the request through the mock agent
	const dispatchHandlers: Dispatcher.DispatchHandlers = {
		onConnect(_abort) {}, // (ignored)
		onError(error) {
			responseReject(error);
		},
		onUpgrade(_statusCode, _headers, _socket) {
			assert.fail("Unreachable: upgrade requests not supported");
		},
		// `onHeaders` and `onData` will only be called if the response was mocked
		onHeaders(statusCode, headers, _resume, statusText) {
			responseStatusCode = statusCode;
			responseStatusText = statusText;

			if (headers === null) {
				return true;
			}
			assert.strictEqual(headers.length % 2, 0, "Expected key/value array");
			responseHeaders = Array.from({ length: headers.length / 2 }).map(
				(_, i) => [headers[i * 2].toString(), headers[i * 2 + 1].toString()]
			);
			return true;
		},
		onData(chunk) {
			responseChunks.push(chunk);
			return true;
		},
		onComplete(_trailers) {
			// `maybeResponse` will be `undefined` if we mocked the request
			const maybeResponse = responses.get(dispatchOptions);
			if (maybeResponse === undefined) {
				const responseBody = Buffer.concat(responseChunks);
				const response = new Response(responseBody, {
					status: responseStatusCode,
					statusText: responseStatusText,
					headers: responseHeaders,
				});
				responseResolve(response);
			} else {
				responseResolve(maybeResponse);
			}
		},
		onBodySent(_chunk) {}, // (ignored)
	};

	fetchMock.dispatch(dispatchOptions, dispatchHandlers);
	return responsePromise;
};
