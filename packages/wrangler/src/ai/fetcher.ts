import { Headers, Response } from "miniflare";
import { performApiFetch } from "../cfetch";
import { logger } from "../logger";
import { getAccountId } from "../user";
import type { ComplianceConfig } from "@cloudflare/workers-utils";
import type { Request } from "miniflare";

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

		if (res.status === 403) {
			try {
				const clonedRes = res.clone();
				const body = (await clonedRes.json()) as {
					errors?: Array<{ code?: number; message?: string }>;
				};
				const authError = body?.errors?.find((e) => e.code === 1031);
				if (authError) {
					logger.error(
						"Authentication error (code 1031): Your API token may have expired or lacks the required permissions. Please refresh your token by running `wrangler login`."
					);
				}
			} catch {
				// If we can't parse the response body, fall through to return the original response
			}
		}

		const respHeaders = new Headers(res.headers);
		respHeaders.delete("Host");
		respHeaders.delete("Content-Length");

		return new Response(res.body, { status: res.status, headers: respHeaders });
	};
}
