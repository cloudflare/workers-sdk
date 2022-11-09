import { z } from "zod";
import { Worker_Binding } from "../../runtime";
import { SERVICE_LOOPBACK } from "../core";
import {
	BINDING_SERVICE_LOOPBACK,
	BINDING_TEXT_PERSIST,
	BINDING_TEXT_PLUGIN,
	HEADER_PERSIST,
	PersistenceSchema,
	Plugin,
} from "../shared";
import { CacheGateway } from "./gateway";
import { CacheRouter } from "./router";

export const CacheOptionsSchema = z.object({
	cache: z.boolean().optional(),
	cacheWarnUsage: z.boolean().optional(),
});
export const CacheSharedOptionsSchema = z.object({
	cachePersist: PersistenceSchema,
});
export const CACHE_LOOPBACK_SCRIPT = `addEventListener("fetch", (event) => {
  let request = event.request;
  const url = new URL(request.url);
  url.pathname = \`/\${${BINDING_TEXT_PLUGIN}}/\${encodeURIComponent(request.url)}\`;
  if (globalThis.${BINDING_TEXT_PERSIST} !== undefined) {
    request = new Request(request);
    request.headers.set("${HEADER_PERSIST}", ${BINDING_TEXT_PERSIST});
  }
  event.respondWith(${BINDING_SERVICE_LOOPBACK}.fetch(url, request));
});`;
export const CACHE_PLUGIN_NAME = "cache";
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
	getServices() {
		const loopbackBinding: Worker_Binding = {
			name: BINDING_SERVICE_LOOPBACK,
			service: { name: SERVICE_LOOPBACK },
		};
		return [
			{
				name: "cache",
				worker: {
					serviceWorkerScript: CACHE_LOOPBACK_SCRIPT,
					bindings: [
						{ name: BINDING_TEXT_PLUGIN, text: CACHE_PLUGIN_NAME },
						loopbackBinding,
					],
					compatibilityDate: "2022-09-01",
				},
			},
		];
	},
};

export * from "./gateway";
