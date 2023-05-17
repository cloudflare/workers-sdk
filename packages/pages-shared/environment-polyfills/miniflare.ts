import { polyfill } from ".";

export default async () => {
	const mf = await import("miniflare");
	polyfill({
		fetch: mf.fetch,
		Headers: mf.Headers,
		Request: mf.Request,
		Response: mf.Response,
	});
};
