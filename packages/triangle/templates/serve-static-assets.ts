import worker from "__ENTRY_POINT__";
import {
	getAssetFromKV,
	NotFoundError,
	MethodNotAllowedError,
	serveSinglePageApp,
} from "__KV_ASSET_HANDLER__";
import type { Options, CacheControl } from "__KV_ASSET_HANDLER__";
import manifest from "__STATIC_CONTENT_MANIFEST";
import type * as kvAssetHandler from "@cloudflare/kv-asset-handler";

const ASSET_MANIFEST = JSON.parse(manifest);

export * from "__ENTRY_POINT__";

// Injected as `esbuild` `define`s
declare global {
	const __CACHE_CONTROL_OPTIONS__: Partial<CacheControl>;
	const __SERVE_SINGLE_PAGE_APP__: boolean;
}

export default <ExportedHandler<{ __STATIC_CONTENT: KVNamespace }>>{
	...worker,
	async fetch(request, env, ctx) {
		let options: Partial<Options> = {
			ASSET_MANIFEST,
			ASSET_NAMESPACE: env.__STATIC_CONTENT,
			cacheControl: __CACHE_CONTROL_OPTIONS__,
			mapRequestToAsset: __SERVE_SINGLE_PAGE_APP__
				? serveSinglePageApp
				: undefined,
		};

		try {
			const page = await (
				getAssetFromKV as typeof kvAssetHandler.getAssetFromKV
			)(
				{
					request,
					waitUntil(promise) {
						return ctx.waitUntil(promise);
					},
				},
				options
			);

			// allow headers to be altered
			const response = new Response(page.body, page);

			response.headers.set("X-XSS-Protection", "1; mode=block");
			response.headers.set("X-Content-Type-Options", "nosniff");
			response.headers.set("X-Frame-Options", "DENY");
			response.headers.set("Referrer-Policy", "unsafe-url");
			response.headers.set("Feature-Policy", "none");

			return response;
		} catch (e) {
			if (e instanceof NotFoundError || e instanceof MethodNotAllowedError) {
				// if a known error is thrown then serve from actual worker
				return await worker.fetch?.(request, env, ctx);
			}
			// otherwise it's a real error, so throw it
			throw e;
		}
	},
};
