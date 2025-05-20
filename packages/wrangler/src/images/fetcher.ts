import { Response } from "miniflare";
import { performApiFetch } from "../cfetch/internal";
import { getAccountId } from "../user";
import type { ComplianceConfig } from "../cfetch/internal";
import type { Request } from "miniflare";

export const EXTERNAL_IMAGES_WORKER_NAME = "__WRANGLER_EXTERNAL_IMAGES_WORKER";

export const EXTERNAL_IMAGES_WORKER_SCRIPT = `
import makeBinding from 'cloudflare-internal:images-api'

export default function (env) {
    return makeBinding({
        fetcher: env.FETCHER,
    });
}
`;

export function getImagesRemoteFetcher(complianceConfig: ComplianceConfig) {
	return async function imagesRemoteFetcher(
		request: Request
	): Promise<Response> {
		const accountId = await getAccountId(complianceConfig);

		const url = `/accounts/${accountId}/images_edge/v2/binding/preview${new URL(request.url).pathname}`;

		const res = await performApiFetch(complianceConfig, url, {
			method: request.method,
			body: request.body,
			duplex: "half",
			headers: {
				"content-type": request.headers.get("content-type") || "",
			},
		});

		return new Response(res.body, { headers: res.headers });
	};
}
