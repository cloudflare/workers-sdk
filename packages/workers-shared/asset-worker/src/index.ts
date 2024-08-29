import { WorkerEntrypoint } from "cloudflare:workers";
import { AssetsManifest } from "./assets-manifest";
import {
	InternalServerErrorResponse,
	MethodNotAllowedResponse,
	NotFoundResponse,
	OkResponse,
} from "./responses";
import { getAdditionalHeaders, getMergedHeaders } from "./utils/headers";
import { getAssetWithMetadataFromKV } from "./utils/kv";

export default class extends WorkerEntrypoint<Env> {
	async fetch(request: Request) {
		try {
			return this.handleRequest(request);
		} catch (err) {
			return new InternalServerErrorResponse(err);
		}
	}

	async handleRequest(request: Request) {
		const assetEntry = await this.getAssetEntry(request);
		if (!assetEntry) {
			return new NotFoundResponse();
		}
		if (request.method.toLowerCase() !== "get") {
			return new MethodNotAllowedResponse();
		}
		const assetResponse = await getAssetWithMetadataFromKV(
			this.env.ASSETS_KV_NAMESPACE,
			assetEntry
		);

		if (!assetResponse || !assetResponse.value) {
			throw new Error(
				`Requested asset ${assetEntry} exists in the asset manifest but not in the KV namespace.`
			);
		}

		const { value: assetContent, metadata: assetMetadata } = assetResponse;
		const additionalHeaders = getAdditionalHeaders(
			assetEntry,
			assetMetadata,
			request
		);
		const headers = getMergedHeaders(request.headers, additionalHeaders);

		return new OkResponse(assetContent, { headers });
	}

	private async getAssetEntry(request: Request) {
		const url = new URL(request.url);
		let { pathname } = url;

		const assetsManifest = new AssetsManifest(this.env.ASSETS_MANIFEST);
		pathname = globalThis.decodeURIComponent(pathname);

		return await assetsManifest.get(pathname);
	}
}
