// @ts-ignore
import AssetWorker from "@cloudflare/workers-shared/dist/asset-worker.mjs";
import type { WorkerEntrypoint } from "cloudflare:workers";

export default class CustomAssetWorker extends (AssetWorker as typeof WorkerEntrypoint<Env>) {
	override async fetch(request: Request): Promise<Response> {
		const response = await super.fetch!(request);
		const modifiedResponse = new Response(response.body, response);
		modifiedResponse.headers.delete("ETag");
		modifiedResponse.headers.delete("Cache-Control");

		return modifiedResponse;
	}
	async unstable_getByETag(
		eTag: string,
		request: Request
	): Promise<{ readableStream: ReadableStream; contentType: string }> {
		const url = new URL(request.url);
		url.pathname = eTag;
		const pathRequest = new Request(url, request);
		console.log(`AssetWorker: getByEtag(${pathRequest.url})`);
		const response = await fetchAsset(pathRequest);

		const readableStream = response.body;
		if (!readableStream) {
			throw new Error(`Unexpected error. No content found for ${eTag}.`);
		}

		const contentType = response.headers.get("Content-Type");
		if (!contentType) {
			throw new Error(
				`Unexpected error. Content type is missing from the for ${eTag}`
			);
		}

		return { readableStream, contentType };
	}
	async unstable_exists(
		pathname: string,
		request: Request
	): Promise<string | null> {
		const url = new URL(request.url);
		url.pathname = pathname;
		const pathRequest = new Request(url, request);
		console.log(`AssetWorker: exists(${pathRequest.url})`);
		const response = await fetchAsset(pathRequest);
		const exists = response.status === 200;
		console.log(
			pathname,
			response.statusText,
			response.headers.get("content-type")
		);
		return exists ? pathname : null;
	}
}

function fetchAsset(request: Request) {
	try {
		const headers = new Headers(request.headers);
		headers.set("__CF_REQUEST_TYPE_", "ASSET");
		const newRequest = new Request(request, { headers });
		return fetch(newRequest);
	} catch (error) {
		throw new Error(`Unexpected error. Failed to fetch asset: ${request.url}`);
	}
}
