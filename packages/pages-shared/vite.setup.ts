import { fetch, Headers, Request, Response } from "@miniflare/core";
import { HTMLRewriter } from "@miniflare/html-rewriter";
import { polyfill } from "./environment-polyfills";

polyfill({
	fetch,
	Headers,
	Request,
	Response,
	HTMLRewriter,
});
