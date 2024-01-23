import {
	Headers as WorkerHeaders,
	HTMLRewriter as WorkerHTMLRewriter,
	Request as WorkerRequest,
	Response as WorkerResponse,
} from "@cloudflare/workers-types/experimental";
import type {
	CacheStorage as WorkerCacheStorage,
	fetch as workerFetch,
	ReadableStream as WorkerReadableStream,
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

export {
	workerFetch as fetch,
	WorkerHeaders as Headers,
	WorkerRequest as Request,
	WorkerResponse as Response,
};
