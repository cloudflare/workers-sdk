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

const ALLOWED_OPS = ["query", "getByIds", "list", "info"];

interface VectorizeAPIResponse {
	result: object;
	success: boolean;
	errors: {
		code: number;
		message: string;
	}[];
}

export function MakeVectorizeFetcher(indexId: string, indexVersion: string) {
	return async function (request: Request): Promise<Response> {
		const accountId = await getAccountId();

		request.headers.delete("Host");
		request.headers.delete("Content-Length");

		const op = request.url.split("/").pop() || "";
		if (!ALLOWED_OPS.includes(op)) {
			return new Response(
				JSON.stringify({
					code: 1003,
					error:
						"Invalid operation: Only read operations are allowed in local dev mode; pass `--remote` to wrangler dev to use write operations.",
				}),
				{ status: 403 }
			);
		}

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

		// APIv4 has a different response structure than local bindings, so we make a simple conversion here
		const apiResponse = (await res.json()) as VectorizeAPIResponse;
		const newResponse = apiResponse.success
			? apiResponse.result
			: {
					error: apiResponse.errors[0].message,
					code: apiResponse.errors[0].code,
				};

		return new Response(JSON.stringify(newResponse), {
			status: res.status,
			headers: respHeaders,
		});
	};
}
