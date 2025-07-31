import { Response } from "miniflare";
import { performApiFetch } from "../cfetch/internal";
import { getAccountId } from "../user";
import type { ComplianceConfig } from "../environment-variables/misc-variables";
import type { Request } from "miniflare";

export const EXTERNAL_IMAGES_WORKER_NAME = "__WRANGLER_EXTERNAL_IMAGES_WORKER";

export const EXTERNAL_IMAGES_WORKER_SCRIPT = `
import makeBinding from 'cloudflare-internal:images-api'

export default function (env) {
    return makeBinding({
        fetcher: env.FETCHER,
				edgeApiFetcher: env.EDGE_API_FETCHER,
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

export function getImagesRemoteEdgeApiFetcher(
	complianceConfig: ComplianceConfig
) {
	return async function imagesRemoteEdgeApiFetcher(
		request: Request
	): Promise<Response> {
		const accountId = await getAccountId(complianceConfig);

		const imageId = new URL(request.url).pathname.split("/").pop();
		const url = `/accounts/${accountId}/images_edge/v1/${imageId}/blob`;

		const res = await performApiFetch(complianceConfig, url, {
			method: request.method,
			body: request.body,
			duplex: "half",
			headers: {
				"content-type": request.headers.get("content-type") || "",
			},
		});

		if (res.status != 200) {
			throw new Error(
				`Unexpected response when fetching image: ${res.status} - ${res.statusText}`
			);
		}

		return new Response(res.body, { headers: res.headers });
	};
}
