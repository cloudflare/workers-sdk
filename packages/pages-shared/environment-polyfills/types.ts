import {
	Headers as WorkerHeaders,
	Request as WorkerRequest,
	Response as WorkerResponse,
} from "@cloudflare/workers-types/experimental";
import type { fetch as workerFetch } from "@cloudflare/workers-types/experimental";

export type PolyfilledRuntimeEnvironment = {
	fetch: typeof workerFetch;
	Headers: typeof Headers;
	Request: typeof Request;
	Response: typeof Response;
	HTMLRewriter: typeof HTMLRewriter;
};

export {
	workerFetch as fetch,
	WorkerHeaders as Headers,
	WorkerRequest as Request,
	WorkerResponse as Response,
};
