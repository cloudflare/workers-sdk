import { SharedBindings } from "miniflare:shared";

interface Env {
	[SharedBindings.MAYBE_SERVICE_BLOBS]: Fetcher;
	__STATIC_ASSETS_REVERSE_MAP: ArrayBuffer;
}

type AssetReverseMap = { [pathHash: string]: string }; //map to actual filepath

export default <ExportedHandler<Env>>{
	async fetch(request, env) {
		// Only permit reads
		if (request.method !== "GET") {
			const message = `Cannot ${request.method.toLowerCase()}() with Workers Assets namespace`;
			return new Response(message, { status: 405, statusText: message });
		}

		const decoder = new TextDecoder();
		const reverseMap: AssetReverseMap = JSON.parse(
			decoder.decode(env.__STATIC_ASSETS_REVERSE_MAP)
		);

		// don't decode pathname because we encode the filepath before hashing
		const key = new URL(request.url).pathname.substring(1);
		const filePath = reverseMap[key] ?? "";

		const blobsService = env[SharedBindings.MAYBE_SERVICE_BLOBS];
		if (filePath === "" || filePath === "/") {
			return new Response("Not Found", {
				status: 404,
			});
		} else {
			return blobsService.fetch(new URL(filePath, "http://placeholder"));
		}
	},
};
