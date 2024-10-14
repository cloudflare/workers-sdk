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

interface VectorizeAPIResponse {
	result: object;
	success: boolean;
	errors: {
		code: number;
		message: string;
	}[];
}

const URL_SUBSTITUTIONS = new Map<string, string>([
	["getByIds", "get_by_ids"],
	["deleteByIds", "delete_by_ids"],
]);

function toNdJson(arr: object[]): string {
	return arr.reduce((acc, o) => acc + JSON.stringify(o) + "\n", "").trim();
}

export function MakeVectorizeFetcher(indexId: string, indexVersion: string) {
	return async function (request: Request): Promise<Response> {
		const accountId = await getAccountId();

		request.headers.delete("Host");
		request.headers.delete("Content-Length");

		let op = request.url.split("/").pop() || "";
		op = URL_SUBSTITUTIONS.get(op) || op;
		const base = `/accounts/${accountId}/vectorize/v2/indexes/${indexId}/`;

		const url = base + op;

		const res = await performApiFetch(url, {
			method: request.method,
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
