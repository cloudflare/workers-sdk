import { Request as UndiciRequest, Response as UndiciResponse } from "undici";
import type {
	fetch as undiciFetch,
	ResponseInit as UndiciResponseInit,
} from "undici";

// MSW assumes these types are available globally. However, Wrangler is typed in a Node v16 environment (Wrangler's minimum supported Node version), which doesn't have these types available globally
// This file declares them globally only when in tests to make the MSW types work
declare global {
	declare class Request extends UndiciRequest {}
	declare class Response extends UndiciResponse {}
	type ResponseInit = UndiciResponseInit;
	const fetch: typeof undiciFetch;
}
