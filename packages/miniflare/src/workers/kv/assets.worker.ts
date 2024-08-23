import { SharedBindings } from "miniflare:shared";

interface Env {
	[SharedBindings.MAYBE_SERVICE_BLOBS]: Fetcher;
	__STATIC_ASSETS_REVERSE_MAP: AssetReverseMap;
}

type AssetReverseMap = {
	[pathHash: string]: { filePath: string; contentType: string };
}; //map to actual filepath

export default <ExportedHandler<Env>>{
	async fetch(request, env) {
		// Only permit reads
		if (request.method !== "GET") {
			const message = `Cannot ${request.method.toLowerCase()}() with Workers Assets namespace`;
			return new Response(message, { status: 405, statusText: message });
		}

		// don't uri decode pathname, because we encode the filepath before hashing
		const pathHash = new URL(request.url).pathname.substring(1);

		const entry = env.__STATIC_ASSETS_REVERSE_MAP[pathHash];
		if (entry === undefined) {
			return new Response("Not Found", { status: 404 });
		}
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { filePath, contentType } = entry;
		const blobsService = env[SharedBindings.MAYBE_SERVICE_BLOBS];
		const response = await blobsService.fetch(
			new URL(filePath, "http://placeholder")
		);
		const newResponse = new Response(response.body, response);
		// ensure the runtime will return the metadata we need
		newResponse.headers.append(
			"cf-kv-metadata",
			`{"contentType": "${contentType}"}`
		);
		return newResponse;
	},
};
