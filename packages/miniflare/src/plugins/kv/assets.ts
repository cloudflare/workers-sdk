import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { getType } from "mime";
import { KVOptionsSchema } from "miniflare";
import prettyBytes from "pretty-bytes";
import SCRIPT_KV_ASSETS from "worker:kv/assets";
import { z } from "zod";
import { Service, Worker_Binding } from "../../runtime";
import { getAssetsBindingsNames, SharedBindings } from "../../workers";
import { kProxyNodeBinding } from "../shared";
import { KV_PLUGIN_NAME } from "./constants";

export interface AssetsOptions {
	assetsPath: string;
	assetsKVBindingName?: string;
	assetsManifestBindingName?: string;
}

export function isWorkersWithAssets(
	options: z.infer<typeof KVOptionsSchema>
): options is AssetsOptions {
	return options.assetsPath !== undefined;
}

const SERVICE_NAMESPACE_ASSET = `${KV_PLUGIN_NAME}:asset`;

export const buildAssetsManifest = async (dir: string) => {
	const manifest = await walk(dir);
	const sortedAssetManifest = sortManifest(manifest);
	const encodedAssetManifest = encodeManifest(sortedAssetManifest);
	return encodedAssetManifest;
};

export async function getAssetsBindings(
	options: AssetsOptions
): Promise<Worker_Binding[]> {
	const assetsBindings = getAssetsBindingsNames(
		options?.assetsKVBindingName,
		options?.assetsManifestBindingName
	);

	const assetsManifest = await buildAssetsManifest(options.assetsPath);
	return [
		{
			// this is the binding to the KV namespace that the assets are in.
			name: assetsBindings.ASSETS_KV_NAMESPACE,
			kvNamespace: { name: SERVICE_NAMESPACE_ASSET },
		},
		{
			// this is the binding to an ArrayBuffer containing the binary-encoded
			// assets manifest.
			name: assetsBindings.ASSETS_MANIFEST,
			data: assetsManifest,
		},
	];
}

export async function getAssetsNodeBindings(
	options: AssetsOptions
): Promise<Record<string, unknown>> {
	const assetsManifest = buildAssetsManifest(options.assetsPath);
	const assetsBindings = getAssetsBindingsNames(
		options?.assetsKVBindingName,
		options?.assetsManifestBindingName
	);

	return {
		[assetsBindings.ASSETS_KV_NAMESPACE]: kProxyNodeBinding,
		[assetsBindings.ASSETS_MANIFEST]: assetsManifest,
	};
}

export async function getAssetsServices(
	options: AssetsOptions
): Promise<Service[]> {
	const assetsReverseMap = await createReverseMap(options.assetsPath);

	const storageServiceName = `${SERVICE_NAMESPACE_ASSET}:storage`;
	const storageService: Service = {
		name: storageServiceName,
		disk: { path: options.assetsPath, writable: true },
	};
	const namespaceService: Service = {
		name: SERVICE_NAMESPACE_ASSET,
		worker: {
			compatibilityDate: "2023-07-24",
			compatibilityFlags: ["nodejs_compat"],
			modules: [
				{
					name: "assets.worker.js",
					esModule: SCRIPT_KV_ASSETS(),
				},
			],
			bindings: [
				{
					name: SharedBindings.MAYBE_SERVICE_BLOBS,
					service: { name: storageServiceName },
				},
				{
					name: "__STATIC_ASSETS_REVERSE_MAP",
					json: assetsReverseMap,
				},
			],
		},
	};
	return [storageService, namespaceService];
}

// ASSET MANIFEST
//
// 1. Traverse the asset directory to create an asset manifest.
// (In prod the manifest contains a pathHash and a contentHash. The
// contentHash is used for uploading and as the keys for the KV namespace
// where the assets are stored. Uploading is irrelevant in dev, so for
// performance reasons, the pathHash is reused for the "contentHash".)
//
// 2. Sort and binary encode the asset manifest
// This is available to asset service worker as a binding.

const MAX_ASSET_COUNT = 20_000;
const MAX_ASSET_SIZE = 25 * 1024 * 1024;
const MANIFEST_HEADER_SIZE = 20;

const PATH_HASH_OFFSET = 0;
const PATH_HASH_SIZE = 16;

const CONTENT_HASH_OFFSET = PATH_HASH_SIZE;
const CONTENT_HASH_SIZE = 16;

const TAIL_RESERVED_SIZE = 8;

const ENTRY_SIZE = PATH_HASH_SIZE + CONTENT_HASH_SIZE + TAIL_RESERVED_SIZE;

const walk = async (dir: string) => {
	const files = await fs.readdir(dir, { recursive: true });
	const manifest: Uint8Array[] = [];
	let counter = 0;
	await Promise.all(
		files.map(async (file) => {
			const filepath = path.join(dir, file);
			const relativeFilepath = path.relative(dir, filepath);
			const filestat = await fs.stat(filepath);

			// TODO: decide whether to follow symbolic links
			if (filestat.isSymbolicLink() || filestat.isDirectory()) {
				return;
			} else {
				if (counter >= MAX_ASSET_COUNT) {
					throw new Error(
						`Maximum number of assets exceeded.\n` +
							`Cloudflare Workers supports up to ${MAX_ASSET_COUNT.toLocaleString()} assets in a version. We found ${counter.toLocaleString()} files in the specified assets directory "${dir}".\n` +
							`Ensure your assets directory contains a maximum of ${MAX_ASSET_COUNT.toLocaleString()} files, and that you have specified your assets directory correctly.`
					);
				}

				if (filestat.size > MAX_ASSET_SIZE) {
					throw new Error(
						`Asset too large.\n` +
							`Cloudflare Workers supports assets with sizes of up to ${prettyBytes(
								MAX_ASSET_SIZE,
								{
									binary: true,
								}
							)}. We found a file ${filepath} with a size of ${prettyBytes(
								filestat.size,
								{
									binary: true,
								}
							)}.\n` +
							`Ensure all assets in your assets directory "${dir}" conform with the Workers maximum size requirement.`
					);
				}

				manifest.push(await hashPath(encodeFilePath(relativeFilepath)));
				counter++;
			}
		})
	);
	return manifest;
};

const hashPath = async (path: string) => {
	const encoder = new TextEncoder();
	const data = encoder.encode(path);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data.buffer);
	return new Uint8Array(hashBuffer, 0, PATH_HASH_SIZE);
};

const encodeFilePath = (filePath: string) => {
	const encodedPath = filePath
		.split(path.sep)
		.map((segment) => encodeURIComponent(segment))
		.join("/");
	return "/" + encodedPath;
};

// sorts ascending by path hash
const sortManifest = (manifest: Uint8Array[]) => {
	return manifest.sort(comparisonFn);
};

const comparisonFn = (a: Uint8Array, b: Uint8Array) => {
	// i don't see why this would ever be the case
	if (a.length < b.length) {
		return -1;
	}
	if (a.length > b.length) {
		return 1;
	}
	for (const [i, v] of a.entries()) {
		if (v < b[i]) {
			return -1;
		}
		if (v > b[i]) {
			return 1;
		}
	}
	return 1;
};

const encodeManifest = (manifest: Uint8Array[]) => {
	const assetManifestBytes = new Uint8Array(
		MANIFEST_HEADER_SIZE + manifest.length * ENTRY_SIZE
	);
	for (const [i, entry] of manifest.entries()) {
		const entryOffset = MANIFEST_HEADER_SIZE + i * ENTRY_SIZE;
		// NB: PATH_HASH_OFFSET = 0
		// set the path hash:
		assetManifestBytes.set(entry, entryOffset + PATH_HASH_OFFSET);
		// set the content hash, which happens to be the same as the path hash in dev:
		assetManifestBytes.set(entry, entryOffset + CONTENT_HASH_OFFSET);
	}
	return assetManifestBytes;
};

// ASSET REVERSE MAP
//
// In prod, the contentHash is used as the key for the KV store that holds the assets.
// Asset Worker will hash the path of an incoming request, look for that pathHash in
// the stored manifest, and get the corresponding contentHash to use as the KV key.
// In dev, we fake out this KV store and just get the assets from disk. However we still need
// to map a given "contentHash" to the filePath. This is what the ASSET REVERSE MAP is for.
// This is available to the FAKE_KV_NAMESPACE service (assets.worker.ts) as a binding.

type AssetReverseMap = {
	[pathHash: string]: { filePath: string; contentType: string };
};

const createReverseMap = async (dir: string) => {
	const files = await fs.readdir(dir, { recursive: true });
	const assetsReverseMap: AssetReverseMap = {};
	await Promise.all(
		files.map(async (file) => {
			const filepath = path.join(dir, file);
			const relativeFilepath = path.relative(dir, filepath);
			const filestat = await fs.stat(filepath);

			if (filestat.isSymbolicLink() || filestat.isDirectory()) {
				return;
			} else {
				const pathHash = bytesToHex(
					await hashPath(encodeFilePath(relativeFilepath))
				);
				assetsReverseMap[pathHash] = {
					filePath: relativeFilepath,
					contentType: getType(filepath) ?? "application/octet-stream",
				};
			}
		})
	);
	return JSON.stringify(assetsReverseMap);
};

const bytesToHex = (buffer: ArrayBufferLike) => {
	return [...new Uint8Array(buffer)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
};
