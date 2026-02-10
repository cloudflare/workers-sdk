import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import SCRIPT_KV_SITES from "worker:kv/sites";
import { Service, Worker_Binding } from "../../runtime";
import { globsToRegExps } from "../../shared";
import {
	encodeSitesKey,
	serialiseSiteRegExps,
	SharedBindings,
	SiteBindings,
	SiteMatcherRegExps,
	testSiteRegExps,
} from "../../workers";
import { ProxyNodeBinding } from "../shared";
import { KV_PLUGIN_NAME } from "./constants";

async function* listKeysInDirectoryInner(
	rootPath: string,
	currentPath: string
): AsyncGenerator<string> {
	const fileEntries = await fs.readdir(currentPath, { withFileTypes: true });
	for (const fileEntry of fileEntries) {
		const filePath = path.posix.join(currentPath, fileEntry.name);
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

// Cache glob RegExps between `getBindings` and `getServices` calls
const sitesRegExpsCache = new WeakMap<SitesOptions, SiteMatcherRegExps>();

const SERVICE_NAMESPACE_SITE = `${KV_PLUGIN_NAME}:site`;

async function buildStaticContentManifest(
	sitePath: string,
	siteRegExps: SiteMatcherRegExps
) {
	// Build __STATIC_CONTENT_MANIFEST contents
	const staticContentManifest: Record<string, string> = {};
	for await (const key of listKeysInDirectory(sitePath)) {
		if (testSiteRegExps(siteRegExps, key)) {
			staticContentManifest[key] = encodeSitesKey(key);
		}
	}
	return staticContentManifest;
}

export async function getSitesBindings(
	options: SitesOptions
): Promise<Worker_Binding[]> {
	// Convert include/exclude globs to RegExps
	const siteRegExps: SiteMatcherRegExps = {
		include: options.siteInclude && globsToRegExps(options.siteInclude),
		exclude: options.siteExclude && globsToRegExps(options.siteExclude),
	};
	sitesRegExpsCache.set(options, siteRegExps);

	const __STATIC_CONTENT_MANIFEST = await buildStaticContentManifest(
		options.sitePath,
		siteRegExps
	);

	return [
		{
			name: SiteBindings.KV_NAMESPACE_SITE,
			kvNamespace: { name: SERVICE_NAMESPACE_SITE },
		},
		{
			name: SiteBindings.JSON_SITE_MANIFEST,
			json: JSON.stringify(__STATIC_CONTENT_MANIFEST),
		},
	];
}
export async function getSitesNodeBindings(
	options: SitesOptions
): Promise<Record<string, unknown>> {
	const siteRegExps = sitesRegExpsCache.get(options);
	assert(siteRegExps !== undefined);
	const __STATIC_CONTENT_MANIFEST = await buildStaticContentManifest(
		options.sitePath,
		siteRegExps
	);
	return {
		[SiteBindings.KV_NAMESPACE_SITE]: new ProxyNodeBinding(),
		[SiteBindings.JSON_SITE_MANIFEST]: __STATIC_CONTENT_MANIFEST,
	};
}

export function getSitesServices(options: SitesOptions): Service[] {
	// `siteRegExps` should've been set in `getSitesBindings()`, and `options`
	// should be the same object reference as before.
	const siteRegExps = sitesRegExpsCache.get(options);
	assert(siteRegExps !== undefined);
	// Ensure `siteRegExps` is JSON-serialisable
	const serialisedSiteRegExps = serialiseSiteRegExps(siteRegExps);

	// Use unsanitised file storage to ensure file names containing e.g. dots
	// resolve correctly.
	const persist = path.resolve(options.sitePath);

	const storageServiceName = `${SERVICE_NAMESPACE_SITE}:storage`;
	const storageService: Service = {
		name: storageServiceName,
		disk: { path: persist, writable: true },
	};
	const namespaceService: Service = {
		name: SERVICE_NAMESPACE_SITE,
		worker: {
			compatibilityDate: "2023-07-24",
			compatibilityFlags: ["nodejs_compat"],
			modules: [
				{
					name: "site.worker.js",
					esModule: SCRIPT_KV_SITES(),
				},
			],
			bindings: [
				{
					name: SharedBindings.MAYBE_SERVICE_BLOBS,
					service: { name: storageServiceName },
				},
				{
					name: SiteBindings.JSON_SITE_FILTER,
					json: JSON.stringify(serialisedSiteRegExps),
				},
			],
		},
	};
	return [storageService, namespaceService];
}
