import assert from "assert";
import fs from "fs/promises";
import path from "path";
import { Request } from "../../http";
import { Service, Worker_Binding, Worker_Module } from "../../runtime";
import {
	MatcherRegExps,
	base64Decode,
	base64Encode,
	deserialiseRegExps,
	globsToRegExps,
	lexicographicCompare,
	serialiseRegExps,
	testRegExps,
} from "../../shared";
import { createFileReadableStream } from "../../storage";
import { CoreBindings } from "../../workers";
import {
	BINDING_TEXT_PERSIST,
	HEADER_PERSIST,
	Persistence,
	WORKER_BINDING_SERVICE_LOOPBACK,
} from "../shared";
import {
	HEADER_SITES,
	KV_PLUGIN_NAME,
	MAX_LIST_KEYS,
	PARAM_URL_ENCODED,
} from "./constants";
import {
	KVGatewayGetOptions,
	KVGatewayGetResult,
	KVGatewayListOptions,
	KVGatewayListResult,
	validateGetOptions,
	validateListOptions,
} from "./gateway";

async function* listKeysInDirectoryInner(
	rootPath: string,
	currentPath: string
): AsyncGenerator<string> {
	const fileEntries = await fs.readdir(currentPath, { withFileTypes: true });
	for (const fileEntry of fileEntries) {
		const filePath = path.join(currentPath, fileEntry.name);
		if (fileEntry.isDirectory()) {
			yield* listKeysInDirectoryInner(rootPath, filePath);
		} else {
			// Get key name by removing root directory & path separator
			// (assumes `rootPath` is fully-resolved)
			yield filePath.substring(rootPath.length + 1);
		}
	}
}
function listKeysInDirectory(rootPath: string): AsyncGenerator<string> {
	rootPath = path.resolve(rootPath);
	return listKeysInDirectoryInner(rootPath, rootPath);
}

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
  const response = await ${CoreBindings.SERVICE_LOOPBACK}.fetch(request);
  
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
	for await (const key of listKeysInDirectory(options.sitePath)) {
		if (testSiteRegExps(siteRegExps, key)) {
			staticContentManifest[key] = encodeSitesKey(key);
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
	const persist = path.resolve(options.sitePath);

	return {
		name: SERVICE_NAMESPACE_SITE,
		worker: {
			serviceWorkerScript: SCRIPT_SITE,
			compatibilityDate: "2022-09-01",
			bindings: [
				WORKER_BINDING_SERVICE_LOOPBACK,
				{
					name: BINDING_TEXT_PERSIST,
					text: JSON.stringify(persist),
				},
				{
					name: BINDING_JSON_SITE_FILTER,
					json: JSON.stringify(serialisedSiteRegExps),
				},
			],
		},
	};
}

// Define Workers Sites specific KV gateway functions. We serve directly from
// disk with Workers Sites to ensure we always send the most up-to-date files.
// Otherwise, we'd have to copy files from disk to our own SQLite/blob store
// whenever any of them changed.

export async function sitesGatewayGet(
	persist: Persistence,
	key: string,
	opts?: KVGatewayGetOptions
): Promise<KVGatewayGetResult | undefined> {
	// `persist` is a resolved path set in `getSitesService()`
	assert(typeof persist === "string");

	validateGetOptions(key, opts);
	const filePath = path.join(persist, key);
	if (!filePath.startsWith(persist)) return;
	try {
		return { value: await createFileReadableStream(filePath) };
	} catch (e: unknown) {
		if (
			typeof e === "object" &&
			e !== null &&
			"code" in e &&
			e.code === "ENOENT"
		) {
			return;
		}
		throw e;
	}
}

export async function sitesGatewayList(
	persist: Persistence,
	opts: KVGatewayListOptions = {}
): Promise<KVGatewayListResult> {
	// `persist` is a resolved path set in `getSitesService()`
	assert(typeof persist === "string");

	validateListOptions(opts);
	const { limit = MAX_LIST_KEYS, prefix, cursor } = opts;

	// Get sorted array of all keys matching prefix
	let keys: KVGatewayListResult["keys"] = [];
	for await (const name of listKeysInDirectory(persist)) {
		if (prefix === undefined || name.startsWith(prefix)) keys.push({ name });
	}
	keys.sort((a, b) => lexicographicCompare(a.name, b.name));

	// Apply cursor
	const startAfter = cursor === undefined ? "" : base64Decode(cursor);
	let startIndex = 0;
	if (startAfter !== "") {
		// We could do a binary search here, but listing Workers Sites namespaces
		// is an incredibly unlikely operation, so doesn't need to be optimised
		startIndex = keys.findIndex(({ name }) => name === startAfter);
		// If we couldn't find where to start, return nothing
		if (startIndex === -1) startIndex = keys.length;
		// Since we want to start AFTER this index, add 1 to it
		startIndex++;
	}

	// Apply limit
	const endIndex = startIndex + limit;
	const nextCursor =
		endIndex < keys.length ? base64Encode(keys[endIndex - 1].name) : undefined;
	keys = keys.slice(startIndex, endIndex);

	if (nextCursor === undefined) {
		return { keys, list_complete: true, cursor: undefined };
	} else {
		return { keys, list_complete: false, cursor: nextCursor };
	}
}
