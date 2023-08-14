import { getAssetFromKV } from "@cloudflare/kv-asset-handler";
import manifestJSON from "__STATIC_CONTENT_MANIFEST";
const manifest = JSON.parse(manifestJSON);

export default <ExportedHandler<{ __STATIC_CONTENT: KVNamespace }>>{
	async fetch(request, env, ctx) {
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
};
