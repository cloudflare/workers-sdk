import { fetch, Headers, Request, Response } from "@miniflare/core";
import { HTMLRewriter } from "@miniflare/html-rewriter";

Object.assign(globalThis, {
	fetch,
	Headers,
	Request,
	Response,
	HTMLRewriter,
});
