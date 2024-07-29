import { getAssetFromKV } from "@cloudflare/kv-asset-handler";

addEventListener("fetch", (e) => {
	e.respondWith(
		getAssetFromKV(e).catch(
			(err) => new Response(err.stack, { status: err.status ?? 500 })
		)
	);
});
