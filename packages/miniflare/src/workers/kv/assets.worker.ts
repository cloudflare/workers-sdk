import { SharedBindings } from "miniflare:shared";
import type { AssetReverseMap } from "@cloudflare/workers-shared/utils/generate-manifest";

interface Env {
	[SharedBindings.MAYBE_SERVICE_BLOBS]: Fetcher;
	__STATIC_ASSETS_REVERSE_MAP: string;
}

export default <ExportedHandler<Env>>{
	async fetch(request, env) {
		// Only permit reads
		if (request.method !== "GET") {
			const message = `Cannot ${request.method.toLowerCase()}() with Workers Assets namespace`;
			return new Response(message, { status: 405, statusText: message });
		}

		const reverseMap: AssetReverseMap = JSON.parse(
			env.__STATIC_ASSETS_REVERSE_MAP
		);

		// don't uri decode pathname, because we encode the filepath before hashing
		const pathHash = new URL(request.url).pathname.substring(1);

		const entry = reverseMap[pathHash];
		if (entry === undefined) {
			return new Response("Not Found", { status: 404 });
		}
		const { filePath, contentType } = entry;
		const blobsService = env[SharedBindings.MAYBE_SERVICE_BLOBS];
		return blobsService.fetch(new URL(filePath, "http://placeholder"));
	},
};
