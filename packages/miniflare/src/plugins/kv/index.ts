import { z } from "zod";
import { Service, Worker_Binding } from "../../runtime";
import { SERVICE_LOOPBACK } from "../core";
import {
	BINDING_SERVICE_LOOPBACK,
	BINDING_TEXT_NAMESPACE,
	BINDING_TEXT_PERSIST,
	BINDING_TEXT_PLUGIN,
	HEADER_PERSIST,
	PersistenceSchema,
	Plugin,
	SCRIPT_PLUGIN_NAMESPACE_PERSIST,
	encodePersist,
} from "../shared";
import { HEADER_SITES } from "./constants";
import { KVGateway } from "./gateway";
import { KVRouter } from "./router";

export const KVOptionsSchema = z.object({
	kvNamespaces: z.record(z.string()).optional(),

	// Workers Sites
	sitePath: z.string().optional(),
	siteInclude: z.string().array().optional(),
	siteExclude: z.string().array().optional(),
});
export const KVSharedOptionsSchema = z.object({
	kvPersist: PersistenceSchema,
});

export const KV_PLUGIN_NAME = "kv";
const SERVICE_NAMESPACE_PREFIX = `${KV_PLUGIN_NAME}:ns`;
const SERVICE_NAMESPACE_SITE = `${KV_PLUGIN_NAME}:site`;

// Workers Sites
const BINDING_KV_NAMESPACE_SITE = "__STATIC_CONTENT";
const BINDING_JSON_SITE_MANIFEST = "__STATIC_CONTENT_MANIFEST";
// TODO: add header(s) for key filter, then filter keys in KVRouter
const SCRIPT_SITE = `addEventListener("fetch", (event) => {
  let request = event.request;
  
  if (request.method === "PUT" || request.method === "DELETE") {
    const message = \`Cannot \${request.method.toLowerCase()}() with read-only Workers Sites namespace\`;
    return event.respondWith(new Response(message, {
      status: 400,
      statusText: message,
    }));
  }

  const url = new URL(event.request.url);
  url.pathname = \`/${KV_PLUGIN_NAME}/${BINDING_KV_NAMESPACE_SITE}\${url.pathname}\`;
  
  request = new Request(url, event.request);
  request.headers.set("${HEADER_PERSIST}", ${BINDING_TEXT_PERSIST});
  request.headers.set("${HEADER_SITES}", "true");
  
  event.respondWith(${BINDING_SERVICE_LOOPBACK}.fetch(request));
})`;

export const KV_PLUGIN: Plugin<
	typeof KVOptionsSchema,
	typeof KVSharedOptionsSchema,
	KVGateway
> = {
	gateway: KVGateway,
	router: KVRouter,
	options: KVOptionsSchema,
	sharedOptions: KVSharedOptionsSchema,
	getBindings(options) {
		const bindings = Object.entries(
			options.kvNamespaces ?? []
		).map<Worker_Binding>(([name, id]) => ({
			name,
			kvNamespace: { name: `${SERVICE_NAMESPACE_PREFIX}:${id}` },
		}));

		if (options.sitePath !== undefined) {
			bindings.push(
				{
					name: BINDING_KV_NAMESPACE_SITE,
					kvNamespace: { name: SERVICE_NAMESPACE_SITE },
				},
				// TODO: actually populate manifest here, respecting key filters:
				//  - https://github.com/cloudflare/miniflare/issues/233
				//  - https://github.com/cloudflare/miniflare/issues/326
				{ name: BINDING_JSON_SITE_MANIFEST, json: "{}" }
			);
		}

		return bindings;
	},
	getServices({ options, sharedOptions }) {
		const persistBinding = encodePersist(sharedOptions.kvPersist);
		const loopbackBinding: Worker_Binding = {
			name: BINDING_SERVICE_LOOPBACK,
			service: { name: SERVICE_LOOPBACK },
		};
		const services = Object.entries(options.kvNamespaces ?? []).map<Service>(
			([_, id]) => ({
				name: `${SERVICE_NAMESPACE_PREFIX}:${id}`,
				worker: {
					serviceWorkerScript: SCRIPT_PLUGIN_NAMESPACE_PERSIST,
					bindings: [
						...persistBinding,
						{ name: BINDING_TEXT_PLUGIN, text: KV_PLUGIN_NAME },
						{ name: BINDING_TEXT_NAMESPACE, text: id },
						loopbackBinding,
					],
				},
			})
		);

		if (options.sitePath !== undefined) {
			if (
				options.siteInclude !== undefined ||
				options.siteExclude !== undefined
			) {
				throw new Error("Workers Sites include/exclude not yet implemented!");
			}

			services.push({
				name: SERVICE_NAMESPACE_SITE,
				worker: {
					serviceWorkerScript: SCRIPT_SITE,
					bindings: [
						{
							name: BINDING_TEXT_PERSIST,
							text: JSON.stringify(options.sitePath),
						},
						loopbackBinding,
					],
				},
			});
		}

		return services;
	},
};

export * from "./gateway";
