import { polyfill } from ".";

export default async () => {
	const { HTMLRewriter } = await import("@miniflare/html-rewriter");
	// @ts-expect-error We should properly clean up the Miniflare v2 v3 mixing in this package at some point
	const mf = await import("miniflare");
	polyfill({
		fetch: mf.fetch,
		Headers: mf.Headers,
		Request: mf.Request,
		Response: mf.Response,
		HTMLRewriter: HTMLRewriter,
	});
};
