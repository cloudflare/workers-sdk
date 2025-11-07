import { base64Decode, base64Encode, SharedBindings } from "miniflare:shared";

import {
	decodeSitesKey,
	deserialiseSiteRegExps,
	encodeSitesKey,
	KVLimits,
	KVParams,
	SerialisableSiteMatcherRegExps,
	SiteBindings,
	SiteMatcherRegExps,
	testSiteRegExps,
} from "./constants";
import { decodeListOptions, validateListOptions } from "./validator.worker";

interface Env {
	[SharedBindings.MAYBE_SERVICE_BLOBS]: Fetcher;
	[SiteBindings.JSON_SITE_FILTER]: SerialisableSiteMatcherRegExps;
}

const siteRegExpsCache = new WeakMap<Env, SiteMatcherRegExps>();
function getSiteRegExps(env: Env): SiteMatcherRegExps {
	let regExps = siteRegExpsCache.get(env);
	if (regExps !== undefined) return regExps;
	regExps = deserialiseSiteRegExps(env[SiteBindings.JSON_SITE_FILTER]);
	siteRegExpsCache.set(env, regExps);
	return regExps;
}

// https://github.com/cloudflare/workerd/blob/81d97010e44f848bb95d0083e2677bca8d1658b7/src/workerd/server/server.c%2B%2B#L860-L874
interface DirectoryEntry {
	name: string;
	type:
		| "file"
		| "directory"
		| "symlink"
		| "blockDevice"
		| "characterDevice"
		| "namedPipe"
		| "socket"
		| "other";
}

async function* walkDirectory(
	blobsService: Fetcher,
	path = ""
): AsyncGenerator<string> {
	const res = await blobsService.fetch(`http://placeholder/${path}`);
	const contentType = (res.headers.get("Content-Type") ?? "").toLowerCase();
	const isDirectory = contentType.startsWith("application/json");
	if (!isDirectory) {
		// We should only call this function with directories, but in case this
		// `path` suddenly became a regular file, just return it as a path
		await res.body?.pipeTo(new WritableStream());
		yield path;
		return;
	}

	const entries = await res.json<DirectoryEntry[]>();
	for (const { name, type } of entries) {
		const entryPath = `${path}${path === "" ? "" : "/"}${name}`;
		if (type === "directory") {
			yield* walkDirectory(blobsService, entryPath);
		} else {
			yield entryPath;
		}
	}
}

const encoder = new TextEncoder();
function arrayCompare(a: Uint8Array, b: Uint8Array): number {
	const minLength = Math.min(a.length, b.length);
	for (let i = 0; i < minLength; i++) {
		const aElement = a[i];
		const bElement = b[i];
		if (aElement < bElement) return -1;
		if (aElement > bElement) return 1;
	}
	return a.length - b.length;
}

async function handleListRequest(
	url: URL,
	blobsService: Fetcher,
	siteRegExps: SiteMatcherRegExps
) {
	const options = decodeListOptions(url);
	validateListOptions(options);
	const { limit = KVLimits.MAX_LIST_KEYS, prefix, cursor } = options;

	// Get sorted array of all keys matching prefix. Note KV uses
	// lexicographic ordering in the UTF-8 collation. To do this, we encode all
	// names using a `TextEncoder`, and then compare those arrays. We store the
	// encoded name with the name to avoid encoding on each comparison. For
	// reference, `String#localeCompare` and `Intl.Collator#compare` are not
	// lexicographic (https://github.com/cloudflare/miniflare/issues/235), and
	// `<` doesn't use the UTF-8 collation
	// (https://github.com/cloudflare/miniflare/issues/380).
	let keys: { name: string; encodedName?: Uint8Array }[] = [];
	for await (let name of walkDirectory(blobsService)) {
		if (!testSiteRegExps(siteRegExps, name)) continue;
		name = encodeSitesKey(name);
		if (prefix !== undefined && !name.startsWith(prefix)) continue;
		keys.push({ name, encodedName: encoder.encode(name) });
	}
	// Safety of `!`: all objects we just pushed to `keys` define `encodedName`
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	keys.sort((a, b) => arrayCompare(a.encodedName!, b.encodedName!));
	// Remove `encodedName`s, so they don't get returned
	for (const key of keys) delete key.encodedName;

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
		return Response.json({ keys, list_complete: true });
	} else {
		return Response.json({ keys, list_complete: false, cursor: nextCursor });
	}
}

export default (<ExportedHandler<Env>>{
	async fetch(request, env) {
		// Only permit reads
		if (request.method !== "GET") {
			const message = `Cannot ${request.method.toLowerCase()}() with Workers Sites namespace`;
			return new Response(message, { status: 405, statusText: message });
		}

		// Decode key (empty if listing)
		const url = new URL(request.url);
		let key = url.pathname.substring(1); // Strip leading "/"
		if (url.searchParams.get(KVParams.URL_ENCODED)?.toLowerCase() === "true") {
			key = decodeURIComponent(key);
		}

		// Strip SITES_NO_CACHE_PREFIX
		key = decodeSitesKey(key);

		// If not listing keys, check key is included, returning not found if not
		const siteRegExps = getSiteRegExps(env);
		if (key !== "" && !testSiteRegExps(siteRegExps, key)) {
			return new Response("Not Found", {
				status: 404,
				statusText: "Not Found",
			});
		}

		const blobsService = env[SharedBindings.MAYBE_SERVICE_BLOBS];
		if (key === "") {
			return handleListRequest(url, blobsService, siteRegExps);
		} else {
			return blobsService.fetch(new URL(key, "http://placeholder"));
		}
	},
});
