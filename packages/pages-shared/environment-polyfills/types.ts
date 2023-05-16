import {
	Headers as WorkerHeaders,
	Request as WorkerRequest,
	Response as WorkerResponse,
	HTMLRewriter as WorkerHTMLRewriter,
} from "@cloudflare/workers-types/experimental";
import type {
	fetch as workerFetch,
	ReadableStream as WorkerReadableStream,
	CacheStorage as WorkerCacheStorage,
} from "@cloudflare/workers-types/experimental";

declare global {
	const fetch: typeof workerFetch;
	class Headers extends WorkerHeaders {}
	class Request extends WorkerRequest {}
	class Response extends WorkerResponse {}

	// Not polyfilled
	type ReadableStream = WorkerReadableStream;
	type CacheStorage = WorkerCacheStorage;
	class HTMLRewriter extends WorkerHTMLRewriter {}
}

export type PolyfilledRuntimeEnvironment = {
	fetch: typeof fetch;
	Headers: typeof Headers;
	Request: typeof Request;
	Response: typeof Response;
};

export { fetch, Headers, Request, Response };
