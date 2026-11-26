import assetUrl from "./imported-asset.txt?url";

export default {
	async fetch(request) {
		if (new URL(request.url).pathname === "/imported-asset") {
			return new Response(assetUrl);
		}

		return new Response("Worker response");
	},
} satisfies ExportedHandler;
