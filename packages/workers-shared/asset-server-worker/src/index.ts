import { AssetsManifest } from "./assets-manifest";
import {
	InternalServerErrorResponse,
	MethodNotAllowedResponse,
	NotFoundResponse,
	OkResponse,
} from "./responses";
import { getAdditionalHeaders, getMergedHeaders } from "./utils/headers";
import { getAssetWithMetadataFromKV } from "./utils/kv";

export default {
	async fetch(request: Request, env: Env) {
		if (!request.method.match(/^(get)$/i)) {
			return new MethodNotAllowedResponse();
		}

		try {
			return this.handleRequest(request, env);
		} catch (err) {
			return new InternalServerErrorResponse(err);
		}
	},

	async handleRequest(request: Request, env: Env) {
		const {
			// ASSETS_MANIFEST is a pipeline binding to an ArrayBuffer containing the
			// binary-encoded site manifest
			ASSETS_MANIFEST = new ArrayBuffer(0),

			// ASSETS_KV_NAMESPACE is a pipeline binding to the KV namespace that the
			// assets are in.
			ASSETS_KV_NAMESPACE,
		} = env;

		const url = new URL(request.url);
		let { pathname } = url;

		const assetsManifest = new AssetsManifest(ASSETS_MANIFEST);

		pathname = globalThis.decodeURIComponent(pathname);

		const assetEntry = await assetsManifest.get(pathname);
		if (!assetEntry) {
			return new NotFoundResponse("Not Found :(");
		}

		const assetResponse = await getAssetWithMetadataFromKV(
			ASSETS_KV_NAMESPACE,
			assetEntry
		);
		if (!assetResponse || !assetResponse.value) {
			return new NotFoundResponse("Not Found :(");
		}

		const { value: assetContent, metadata: assetMetadata } = assetResponse;
		const additionalHeaders = getAdditionalHeaders(
			assetEntry,
			assetMetadata,
			request
		);
		const headers = getMergedHeaders(request.headers, additionalHeaders);

		return new OkResponse(assetContent, { headers, encodeBody: "automatic" });
	},
};
