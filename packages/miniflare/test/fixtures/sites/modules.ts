import manifestJSON from "__STATIC_CONTENT_MANIFEST";

import { getAssetFromKV } from "@cloudflare/kv-asset-handler";

const manifest = JSON.parse(manifestJSON);

export default (<
	ExportedHandler<{
		__STATIC_CONTENT: KVNamespace;
		__STATIC_CONTENT_MANIFEST?: undefined;
	}>
>{
	async fetch(request, env, ctx) {
		if (
			"__STATIC_CONTENT_MANIFEST" in env ||
			env.__STATIC_CONTENT_MANIFEST !== undefined
		) {
			return new Response(
				"Expected __STATIC_CONTENT_MANIFEST to be undefined",
				{ status: 500 }
			);
		}
		return await getAssetFromKV(
			{
				request,
				waitUntil(promise) {
					return ctx.waitUntil(promise);
				},
			},
			{
				ASSET_NAMESPACE: env.__STATIC_CONTENT,
				ASSET_MANIFEST: manifest,
			}
		);
	},
});
