import { Headers, Response } from "miniflare";
import { performApiFetch } from "../cfetch/internal";
import { getAccountId } from "../user";
import type { Request } from "miniflare";

export const EXTERNAL_AI_WORKER_NAME = "__WRANGLER_EXTERNAL_AI_WORKER";

export const EXTERNAL_AI_WORKER_SCRIPT = `
import { Ai } from 'cloudflare-internal:ai-api'

export default function (env) {
    return new Ai(env.FETCHER);
}
`;

export async function AIFetcher(request: Request): Promise<Response> {
	const accountId = await getAccountId();

	request.headers.delete("Host");
	request.headers.delete("Content-Length");

	const res = await performApiFetch(`/accounts/${accountId}/ai/run/proxy`, {
		method: "POST",
		headers: Object.fromEntries(request.headers.entries()),
		body: request.body,
		duplex: "half",
	});

	const respHeaders = new Headers(res.headers);
	respHeaders.delete("Host");
	respHeaders.delete("Content-Length");

	return new Response(res.body, { status: res.status, headers: respHeaders });
}
