import AssetWorker from "@cloudflare/workers-shared/asset-worker";
import { UNKNOWN_HOST } from "../../shared";
import type { Env as _Env } from "@cloudflare/workers-shared/asset-worker";
import type { ResolvedConfig } from "vite";

interface Env extends _Env {
	__VITE_HTML_EXISTS__: Fetcher;
	__VITE_FETCH_HTML__: Fetcher;
	__VITE_HEADERS__: string;
}

export default class CustomAssetWorker extends AssetWorker<Env> {
	override async fetch(request: Request) {
		const response = await super.fetch(request);
		const modifiedResponse = new Response(response.body, response);
		modifiedResponse.headers.delete("ETag");
		modifiedResponse.headers.delete("Cache-Control");
		// Add headers set via `server.headers` in the Vite config
		const viteHeaders = JSON.parse(
			this.env.__VITE_HEADERS__
		) as ResolvedConfig["server"]["headers"];

		for (const [key, value] of Object.entries(viteHeaders)) {
			if (Array.isArray(value)) {
				for (const item of value) {
					modifiedResponse.headers.append(key, item);
				}
			} else if (value !== undefined) {
				modifiedResponse.headers.set(key, String(value));
			}
		}

		return modifiedResponse;
	}
	override async unstable_getByETag(eTag: string) {
		const url = new URL(eTag, UNKNOWN_HOST);
		const response = await this.env.__VITE_FETCH_HTML__.fetch(url);

		if (!response.body) {
			throw new Error(`Unexpected error. No HTML found for "${eTag}".`);
		}

		return {
			readableStream: response.body,
			contentType: "text/html",
			cacheStatus: "MISS",
		} as const;
	}
	override async unstable_exists(pathname: string) {
		// We need this regex to avoid getting `//` as a pathname, which results in an invalid URL. Should this be fixed upstream?
		const url = new URL(pathname.replace(/^\/{2,}/, "/"), UNKNOWN_HOST);
		const response = await this.env.__VITE_HTML_EXISTS__.fetch(url);

		return response.json() as Promise<string | null>;
	}
}
