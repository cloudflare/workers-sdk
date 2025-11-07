import type { Request } from "miniflare";

import { Headers, Response } from "miniflare";

import type { ComplianceConfig } from "../environment-variables/misc-variables";

import { performApiFetch } from "../cfetch";
import { getAccountId } from "../user";

export const EXTERNAL_AI_WORKER_NAME = "__WRANGLER_EXTERNAL_AI_WORKER";

export const EXTERNAL_AI_WORKER_SCRIPT = `
import { Ai } from 'cloudflare-internal:ai-api'

export default function (env) {
    return new Ai(env.FETCHER);
}
`;

export function getAIFetcher(complianceConfig: ComplianceConfig) {
	return async function (request: Request): Promise<Response> {
		const accountId = await getAccountId(complianceConfig);

		const reqHeaders = new Headers(request.headers);
		reqHeaders.delete("Host");
		reqHeaders.delete("Content-Length");
		reqHeaders.set("X-Forwarded", request.url);

		const res = await performApiFetch(
			complianceConfig,
			`/accounts/${accountId}/ai/run/proxy`,
			{
				method: request.method,
				headers: Object.fromEntries(reqHeaders.entries()),
				body: request.body,
				duplex: "half",
			}
		);

		const respHeaders = new Headers(res.headers);
		respHeaders.delete("Host");
		respHeaders.delete("Content-Length");

		return new Response(res.body, { status: res.status, headers: respHeaders });
	};
}
