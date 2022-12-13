import { Headers } from "../../http";
import { Worker_Binding } from "../../runtime";
import { Persistence, PersistenceSchema } from "./gateway";

export const SOCKET_ENTRY = "entry";

export const HEADER_PERSIST = "MF-Persist";
// Even though we inject the `cf` blob in the entry script, we still need to
// specify a header, so we receive things like `cf.cacheKey` in loopback
// requests.
export const HEADER_CF_BLOB = "MF-CF-Blob";

export const BINDING_SERVICE_LOOPBACK = "MINIFLARE_LOOPBACK";
export const BINDING_TEXT_PLUGIN = "MINIFLARE_PLUGIN";
export const BINDING_TEXT_NAMESPACE = "MINIFLARE_NAMESPACE";
export const BINDING_TEXT_PERSIST = "MINIFLARE_PERSIST";

// TODO: make this an inherited worker in core plugin
export const SCRIPT_PLUGIN_NAMESPACE_PERSIST = `addEventListener("fetch", (event) => {
  let request = event.request;
  const url = new URL(request.url);
  url.pathname = \`/\${${BINDING_TEXT_PLUGIN}}/\${${BINDING_TEXT_NAMESPACE}}\${url.pathname}\`;
  if (globalThis.${BINDING_TEXT_PERSIST} !== undefined) {
    request = new Request(request);
    request.headers.set("${HEADER_PERSIST}", ${BINDING_TEXT_PERSIST});
  }
  event.respondWith(${BINDING_SERVICE_LOOPBACK}.fetch(url, request));
});`;

export function encodePersist(persist: Persistence): Worker_Binding[] {
	if (persist === undefined) return [];
	else return [{ name: BINDING_TEXT_PERSIST, text: JSON.stringify(persist) }];
}

export function decodePersist(headers: Headers): Persistence {
	const header = headers.get(HEADER_PERSIST);
	return header === null
		? undefined
		: PersistenceSchema.parse(JSON.parse(header));
}

export enum CfHeader {
	Error = "cf-r2-error",
	Request = "cf-r2-request",
	MetadataSize = "cf-r2-metadata-size",
	Blob = "cf-blob",
	CacheNamespace = "cf-cache-namespace",
	CacheStatus = "cf-cache-status",
}
