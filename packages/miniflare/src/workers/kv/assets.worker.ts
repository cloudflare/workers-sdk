import { SharedBindings } from "miniflare:shared";
import { KVParams } from "./constants";

interface Env {
	[SharedBindings.MAYBE_SERVICE_BLOBS]: Fetcher;
}

export default <ExportedHandler<Env>>{
	async fetch(request, env) {
		// Only permit reads
		if (request.method !== "GET") {
			const message = `Cannot ${request.method.toLowerCase()}() with Workers Assets namespace`;
			return new Response(message, { status: 405, statusText: message });
		}

		// Decode key
		const url = new URL(request.url);
		let key = url.pathname.substring(1); // Strip leading "/"

		if (url.searchParams.get(KVParams.URL_ENCODED)?.toLowerCase() === "true") {
			key = decodeURIComponent(key);
		}

		const blobsService = env[SharedBindings.MAYBE_SERVICE_BLOBS];
		if (key === "" || key === "/") {
			return new Response("Not Found", {
				status: 404,
			});
		} else {
			return blobsService.fetch(new URL(key, "http://placeholder"));
		}
	},
};
