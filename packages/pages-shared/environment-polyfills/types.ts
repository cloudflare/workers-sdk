import {
	Headers as MiniflareHeaders,
	Request as MiniflareRequest,
	Response as MiniflareResponse,
} from "@miniflare/core";
import { HTMLRewriter as MiniflareHTMLRewriter } from "@miniflare/html-rewriter";
import type { CacheInterface as MiniflareCacheInterface } from "@miniflare/cache";
import type { fetch as miniflareFetch } from "@miniflare/core";
import type { ReadableStream as SimilarReadableStream } from "stream/web";

declare global {
	const fetch: typeof miniflareFetch;
	class Headers extends MiniflareHeaders {}
	class Request extends MiniflareRequest {}
	class Response extends MiniflareResponse {}

	type CacheInterface = Omit<MiniflareCacheInterface, "match"> & {
		match(
			...args: Parameters<MiniflareCacheInterface["match"]>
		): Promise<Response | undefined>;
	};

	class CacheStorage {
		get default(): CacheInterface;
		open(cacheName: string): Promise<CacheInterface>;
	}

	class HTMLRewriter extends MiniflareHTMLRewriter {
		transform(response: Response): Response;
	}

	type ReadableStream = SimilarReadableStream;
}

export type PolyfilledRuntimeEnvironment = {
	fetch: typeof fetch;
	Headers: typeof Headers;
	Request: typeof Request;
	Response: typeof Response;
};

export { fetch, Headers, Request, Response };
