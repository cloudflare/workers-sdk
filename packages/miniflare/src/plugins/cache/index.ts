import { z } from "zod";
import {
	BINDING_SERVICE_LOOPBACK,
	BINDING_TEXT_PERSIST,
	BINDING_TEXT_PLUGIN,
	CfHeader,
	HEADER_PERSIST,
	PersistenceSchema,
	Plugin,
	WORKER_BINDING_SERVICE_LOOPBACK,
	encodePersist,
} from "../shared";
import { HEADER_CACHE_WARN_USAGE } from "./constants";
import { CacheGateway } from "./gateway";
import { CacheRouter } from "./router";

export const CacheOptionsSchema = z.object({
	cache: z.boolean().optional(),
	cacheWarnUsage: z.boolean().optional(),
});
export const CacheSharedOptionsSchema = z.object({
	cachePersist: PersistenceSchema,
});

const BINDING_JSON_CACHE_WARN_USAGE = "MINIFLARE_CACHE_WARN_USAGE";

const CACHE_SCRIPT_COMPAT_DATE = "2022-09-01";
export const CACHE_LOOPBACK_SCRIPT = `addEventListener("fetch", (event) => {
  const request = new Request(event.request);
  const url = new URL(request.url);
  url.pathname = \`/\${${BINDING_TEXT_PLUGIN}}/\${encodeURIComponent(request.url)}\`;
  if (globalThis.${BINDING_TEXT_PERSIST} !== undefined) request.headers.set("${HEADER_PERSIST}", ${BINDING_TEXT_PERSIST});
  if (globalThis.${BINDING_JSON_CACHE_WARN_USAGE}) request.headers.set("${HEADER_CACHE_WARN_USAGE}", "true");
  event.respondWith(${BINDING_SERVICE_LOOPBACK}.fetch(url, request));
});`;
// Cache service script that doesn't do any caching
export const NOOP_CACHE_SCRIPT = `addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method === "GET") {
    event.respondWith(new Response(null, { status: 504, headers: { [${JSON.stringify(
			CfHeader.CacheStatus
		)}]: "MISS" } }));
  } else if (request.method === "PUT") {
    // Must consume request body, otherwise get "disconnected: read end of pipe was aborted" error from workerd
    event.respondWith(request.arrayBuffer().then(() => new Response(null, { status: 204 })));
  } else if (request.method === "PURGE") {
    event.respondWith(new Response(null, { status: 404 }));
  } else {
    event.respondWith(new Response(null, { status: 405 }));
  }
});`;
export const CACHE_PLUGIN_NAME = "cache";

export function getCacheServiceName(workerIndex: number) {
	return `${CACHE_PLUGIN_NAME}:${workerIndex}`;
}

export const CACHE_PLUGIN: Plugin<
	typeof CacheOptionsSchema,
	typeof CacheSharedOptionsSchema,
	CacheGateway
> = {
	gateway: CacheGateway,
	router: CacheRouter,
	options: CacheOptionsSchema,
	sharedOptions: CacheSharedOptionsSchema,
	getBindings() {
		return [];
	},
	getServices({ sharedOptions, options, workerIndex }) {
		const persistBinding = encodePersist(sharedOptions.cachePersist);
		return [
			{
				name: getCacheServiceName(workerIndex),
				worker: {
					serviceWorkerScript:
						// If options.cache is undefined, default to enabling cache
						options.cache === false ? NOOP_CACHE_SCRIPT : CACHE_LOOPBACK_SCRIPT,
					bindings: [
						...persistBinding,
						{ name: BINDING_TEXT_PLUGIN, text: CACHE_PLUGIN_NAME },
						{
							name: BINDING_JSON_CACHE_WARN_USAGE,
							json: JSON.stringify(options.cacheWarnUsage ?? false),
						},
						WORKER_BINDING_SERVICE_LOOPBACK,
					],
					compatibilityDate: CACHE_SCRIPT_COMPAT_DATE,
				},
			},
		];
	},
};

export * from "./gateway";
export { _RemoveTransformEncodingChunkedStream } from "./router";
