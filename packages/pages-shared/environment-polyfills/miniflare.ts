import { polyfill } from ".";

export default async () => {
	const mf = await import("@miniflare/core");
	const { HTMLRewriter } = await import("@miniflare/html-rewriter");

	polyfill({
		fetch: mf.fetch,
		Headers: mf.Headers,
		Request: mf.Request,
		Response: mf.Response,
		HTMLRewriter,
	});
};
