import { Headers, Response, fetch } from "miniflare";
import type { Request } from "miniflare";

export const WORKERS_DEV_ENDPOINT = "https://staging.api.browser.run";



export async function BrowserFetcher(request: Request): Promise<Response> {

	request.headers.set("Host", WORKERS_DEV_ENDPOINT)

	const res = await fetch(request.url, {
		method: request.method,
		headers: Object.fromEntries(request.headers.entries()),
		body: request.body,
	});

	const respHeaders = new Headers(res.headers);

	return new Response(res.body, { status: res.status, headers: respHeaders });
}
