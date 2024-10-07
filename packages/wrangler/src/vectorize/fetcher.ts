import { Headers, Response } from "miniflare";
import { performApiFetch } from "../cfetch/internal";
import { getAccountId } from "../user";
import type { Request } from "miniflare";

export const EXTERNAL_VECTORIZE_WORKER_NAME =
	"__WRANGLER_EXTERNAL_VECTORIZE_WORKER";

export const EXTERNAL_VECTORIZE_WORKER_SCRIPT = `
import makeBinding from 'cloudflare-internal:vectorize-api'

export default function (env) {
    return makeBinding({
        fetcher: env.FETCHER,
        indexId: env.INDEX_ID,
        indexVersion: env.INDEX_VERSION,
        useNdJson: true,
    });
}
`;

export function MakeVectorizeFetcher(indexId: string, indexVersion: string) {
	return async function (request: Request): Promise<Response> {
		const accountId = await getAccountId();

		request.headers.delete("Host");
		request.headers.delete("Content-Length");

		const url = request.url.replace(
			"http://vector-search/",
			`/accounts/${accountId}/vectorize/${indexVersion}/indexes/${indexId}/`
		);

		// TODO: v1 endpoints have a different format

		const res = await performApiFetch(url, {
			method: "POST",
			headers: Object.fromEntries(request.headers.entries()),
			body: request.body,
			duplex: "half",
		});

		const respHeaders = new Headers(res.headers);
		respHeaders.delete("Host");
		respHeaders.delete("Content-Length");

		return new Response(res.body, { status: res.status, headers: respHeaders });
	};
}
