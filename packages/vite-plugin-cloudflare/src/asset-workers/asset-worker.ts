import AssetWorker from "@cloudflare/workers-shared/dist/asset-worker/src/index.js";
import { UNKNOWN_HOST } from "../shared";

interface Env {
	__VITE_ASSET_EXISTS__: Fetcher;
	__VITE_FETCH_ASSET__: Fetcher;
}

export default class CustomAssetWorker extends AssetWorker {
	override async fetch(request: Request): Promise<Response> {
		const response = await super.fetch!(request);
		const modifiedResponse = new Response(response.body, response);
		modifiedResponse.headers.delete("ETag");
		modifiedResponse.headers.delete("Cache-Control");

		return modifiedResponse;
	}
	override async unstable_getByETag(
		eTag: string
	): ReturnType<AssetWorker["unstable_getByETag"]> {
		const url = new URL(eTag, UNKNOWN_HOST);
		const response = await (
			this as unknown as typeof AssetWorker as unknown as { env: Env }
		).env.__VITE_FETCH_ASSET__.fetch(url);

		if (!response.body) {
			throw new Error(`Unexpected error. No HTML found for ${eTag}.`);
		}

		return {
			readableStream: response.body,
			contentType: "text/html",
			cacheStatus: "MISS",
		};
	}
	override async unstable_exists(
		pathname: string
	): ReturnType<AssetWorker["unstable_exists"]> {
		// We need this regex to avoid getting `//` as a pathname, which results in an invalid URL. Should this be fixed upstream?
		const url = new URL(pathname.replace(/^\/{2,}/, "/"), UNKNOWN_HOST);
		const response = await (
			this as unknown as typeof AssetWorker as unknown as { env: Env }
		).env.__VITE_ASSET_EXISTS__.fetch(url);
		const exists = await response.json();

		return exists ? pathname : null;
	}
	override async unstable_canFetch(
		request: Request
	): ReturnType<AssetWorker["unstable_canFetch"]> {
		// the 'sec-fetch-mode: navigate' header is stripped by something on its way into this worker
		// so we restore it from 'x-mf-sec-fetch-mode'
		const secFetchMode = request.headers.get("X-Mf-Sec-Fetch-Mode");
		if (secFetchMode) {
			request.headers.set("Sec-Fetch-Mode", secFetchMode);
		}
		return await super.unstable_canFetch(request);
	}
}
