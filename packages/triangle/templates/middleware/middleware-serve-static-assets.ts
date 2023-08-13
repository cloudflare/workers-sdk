/// <reference path="middleware-serve-static-assets.d.ts"/>

import {
	getAssetFromKV,
	NotFoundError,
	MethodNotAllowedError,
	serveSinglePageApp,
} from "@cloudflare/kv-asset-handler";
import type { Options } from "@cloudflare/kv-asset-handler";
import { spaMode, cacheControl } from "config:middleware/serve-static-assets";
import type * as kvAssetHandler from "@cloudflare/kv-asset-handler";
import manifest from "__STATIC_CONTENT_MANIFEST";
const ASSET_MANIFEST = JSON.parse(manifest);

import type { Middleware } from "./common";

const staticAssets: Middleware = async (request, env, _ctx, middlewareCtx) => {
	let options: Partial<Options> = {
		ASSET_MANIFEST,
		ASSET_NAMESPACE: env.__STATIC_CONTENT,
		cacheControl: cacheControl,
		mapRequestToAsset: spaMode ? serveSinglePageApp : undefined,
	};

	try {
		const page = await (getAssetFromKV as typeof kvAssetHandler.getAssetFromKV)(
			{
				request,
				waitUntil(promise) {
					return _ctx.waitUntil(promise);
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
			return await middlewareCtx.next(request, env);
		}
		// otherwise it's a real error, so throw it
		throw e;
	}
};

export default staticAssets;
