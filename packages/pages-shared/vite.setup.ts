import { HTMLRewriter } from "@miniflare/html-rewriter";
import { fetch, Headers, Request, Response } from "miniflare";
import { polyfill } from "./environment-polyfills";

polyfill({
	fetch,
	Headers,
	Request,
	Response,
	HTMLRewriter,
});
