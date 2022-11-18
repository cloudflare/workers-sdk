import assert from "assert";
import { pathToFileURL } from "url";
import { Request } from "undici";
import { Service, Worker_Binding, Worker_Module } from "../../runtime";
import {
	MatcherRegExps,
	deserialiseRegExps,
	globsToRegExps,
	serialiseRegExps,
	testRegExps,
} from "../../shared";
import { FileStorage } from "../../storage";
import { SERVICE_LOOPBACK } from "../core";
import {
	BINDING_SERVICE_LOOPBACK,
	BINDING_TEXT_PERSIST,
	HEADER_PERSIST,
	PARAM_FILE_UNSANITISE,
} from "../shared";
import { HEADER_SITES, KV_PLUGIN_NAME, PARAM_URL_ENCODED } from "./constants";

export interface SitesOptions {
	sitePath: string;
	siteInclude?: string[];
	siteExclude?: string[];
}
export interface SiteMatcherRegExps {
	include?: MatcherRegExps;
	exclude?: MatcherRegExps;
}
// Cache glob RegExps between `getBindings` and `getServices` calls
const sitesRegExpsCache = new WeakMap<SitesOptions, SiteMatcherRegExps>();

function testSiteRegExps(regExps: SiteMatcherRegExps, key: string): boolean {
	return (
		// Either include globs undefined, or name matches them
		(regExps.include === undefined || testRegExps(regExps.include, key)) &&
		// Either exclude globs undefined, or name doesn't match them
		(regExps.exclude === undefined || !testRegExps(regExps.exclude, key))
	);
}

// Magic prefix: if a URLs pathname starts with this, it shouldn't be cached.
// This ensures edge caching of Workers Sites files is disabled, and the latest
// local version is always served.
const SITES_NO_CACHE_PREFIX = "$__MINIFLARE_SITES__$/";

function encodeSitesKey(key: string): string {
	// `encodeURIComponent()` ensures `ETag`s used by `@cloudflare/kv-asset-handler`
	// are always byte strings.
	return SITES_NO_CACHE_PREFIX + encodeURIComponent(key);
}
function decodeSitesKey(key: string): string {
	return key.startsWith(SITES_NO_CACHE_PREFIX)
		? decodeURIComponent(key.substring(SITES_NO_CACHE_PREFIX.length))
		: key;
}

export function isSitesRequest(request: Request) {
	const url = new URL(request.url);
	return url.pathname.startsWith(`/${SITES_NO_CACHE_PREFIX}`);
}

const SERVICE_NAMESPACE_SITE = `${KV_PLUGIN_NAME}:site`;

const BINDING_KV_NAMESPACE_SITE = "__STATIC_CONTENT";
const BINDING_JSON_SITE_MANIFEST = "__STATIC_CONTENT_MANIFEST";
const BINDING_JSON_SITE_FILTER = "MINIFLARE_SITE_FILTER";

const SCRIPT_SITE = `
// Inject key encoding/decoding functions
const SITES_NO_CACHE_PREFIX = "${SITES_NO_CACHE_PREFIX}";
const encodeSitesKey = ${encodeSitesKey.toString()};
const decodeSitesKey = ${decodeSitesKey.toString()};

// Inject glob matching RegExp functions
const deserialiseRegExps = ${deserialiseRegExps.toString()};
const testRegExps = ${testRegExps.toString()};
const testSiteRegExps = ${testSiteRegExps.toString()};

// Deserialise glob matching RegExps
const serialisedSiteRegExps = ${BINDING_JSON_SITE_FILTER};
const siteRegExps = {
  include: serialisedSiteRegExps.include && deserialiseRegExps(serialisedSiteRegExps.include),
  exclude: serialisedSiteRegExps.exclude && deserialiseRegExps(serialisedSiteRegExps.exclude),
};

async function handleRequest(request) {
  // Only permit reads
  if (request.method !== "GET") {
    const message = \`Cannot \${request.method.toLowerCase()}() with read-only Workers Sites namespace\`;
    return new Response(message, { status: 405, statusText: message });
  }

  // Decode key (empty if listing)
  const url = new URL(request.url);
  let key = url.pathname.substring(1); // Strip leading "/"
  if (url.searchParams.get("${PARAM_URL_ENCODED}")?.toLowerCase() === "true") {
    key = decodeURIComponent(key);
  }
  
  // Strip SITES_NO_CACHE_PREFIX
  key = decodeSitesKey(key);
  
  // If not listing keys, check key is included, returning not found if not
  if (key !== "" && !testSiteRegExps(siteRegExps, key)) {
    return new Response("Not Found", { status: 404, statusText: "Not Found" })
  }
  
  // Re-encode key
  key = encodeURIComponent(key);
  url.pathname = \`/${KV_PLUGIN_NAME}/${BINDING_KV_NAMESPACE_SITE}/\${key}\`;
  url.searchParams.set("${PARAM_URL_ENCODED}", "true"); // Always URL encoded now
  
  // Send request to loopback server
  request = new Request(url, request);
  request.headers.set("${HEADER_PERSIST}", ${BINDING_TEXT_PERSIST});
  // Add magic header to indicate namespace should be ignored, and persist
  // should be used as the root without any additional namespace
  request.headers.set("${HEADER_SITES}", "true");
  const response = await ${BINDING_SERVICE_LOOPBACK}.fetch(request);
  
  // If listing keys, only return included keys, and add SITES_NO_CACHE_PREFIX
  // to all result keys
  if (key === "" && response.ok) {
    const { keys, list_complete, cursor } = await response.json();
    return Response.json({
      keys: keys.filter((key) => {
        if (!testSiteRegExps(siteRegExps, key)) return false;
        key.name = encodeSitesKey(key.name);
        return true;
      }),
      list_complete,
      cursor,
    });
  }
  
  return response;
}

addEventListener("fetch", (event) => event.respondWith(handleRequest(event.request)));
`;

export async function getSitesBindings(
	options: SitesOptions
): Promise<Worker_Binding[]> {
	// Convert include/exclude globs to RegExps
	const siteRegExps: SiteMatcherRegExps = {
		include: options.siteInclude && globsToRegExps(options.siteInclude),
		exclude: options.siteExclude && globsToRegExps(options.siteExclude),
	};
	sitesRegExpsCache.set(options, siteRegExps);

	// Build __STATIC_CONTENT_MANIFEST contents
	const staticContentManifest: Record<string, string> = {};
	const storage = new FileStorage(options.sitePath, /* sanitise */ false);
	const result = await storage.list();
	assert.strictEqual(result.cursor, "");
	for (const { name } of result.keys) {
		if (testSiteRegExps(siteRegExps, name)) {
			staticContentManifest[name] = encodeSitesKey(name);
		}
	}
	const __STATIC_CONTENT_MANIFEST = JSON.stringify(staticContentManifest);

	return [
		{
			name: BINDING_KV_NAMESPACE_SITE,
			kvNamespace: { name: SERVICE_NAMESPACE_SITE },
		},
		{
			name: BINDING_JSON_SITE_MANIFEST,
			json: __STATIC_CONTENT_MANIFEST,
		},
	];
}

export function maybeGetSitesManifestModule(
	bindings: Worker_Binding[]
): Worker_Module | undefined {
	for (const binding of bindings) {
		if (binding.name === BINDING_JSON_SITE_MANIFEST) {
			assert("json" in binding && binding.json !== undefined);
			return { name: BINDING_JSON_SITE_MANIFEST, text: binding.json };
		}
	}
}

export function getSitesService(options: SitesOptions): Service {
	// `siteRegExps` should've been set in `getSitesBindings()`, and `options`
	// should be the same object reference as before.
	const siteRegExps = sitesRegExpsCache.get(options);
	assert(siteRegExps !== undefined);
	// Ensure `siteRegExps` is JSON-serialisable
	const serialisedSiteRegExps = {
		include: siteRegExps.include && serialiseRegExps(siteRegExps.include),
		exclude: siteRegExps.exclude && serialiseRegExps(siteRegExps.exclude),
	};

	// Use unsanitised file storage to ensure file names containing e.g. dots
	// resolve correctly.
	const persist = pathToFileURL(options.sitePath);
	persist.searchParams.set(PARAM_FILE_UNSANITISE, "true");

	return {
		name: SERVICE_NAMESPACE_SITE,
		worker: {
			serviceWorkerScript: SCRIPT_SITE,
			compatibilityDate: "2022-09-01",
			bindings: [
				{
					name: BINDING_TEXT_PERSIST,
					text: JSON.stringify(persist),
				},
				{
					name: BINDING_SERVICE_LOOPBACK,
					service: { name: SERVICE_LOOPBACK },
				},
				{
					name: BINDING_JSON_SITE_FILTER,
					json: JSON.stringify(serialisedSiteRegExps),
				},
			],
		},
	};
}
