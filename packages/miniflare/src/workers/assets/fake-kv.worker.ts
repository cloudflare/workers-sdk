import { KVParams } from "../kv";

interface Env {
	"assets:storage": Fetcher;
}

/**
 * A Service that pretends to be the KV Namespace that is used to store content
 * for a Worker with Assets.
 */
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

		// Fetch the content for this key
		return env["assets:storage"].fetch(new URL(key, "http://placeholder"));
	},
};
