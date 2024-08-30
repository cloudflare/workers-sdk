import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getType } from "mime";
import prettyBytes from "pretty-bytes";
import SCRIPT_ASSETS from "worker:assets/assets";
import SCRIPT_ASSETS_KV from "worker:assets/assets-kv";
import SCRIPT_ROUTER from "worker:assets/router";
import { z } from "zod";
import { Service } from "../../runtime";
import { SharedBindings } from "../../workers";
import { getUserServiceName } from "../core";
import { kProxyNodeBinding, Plugin } from "../shared";
import {
	ASSETS_KV_SERVICE_NAME,
	ASSETS_PLUGIN_NAME,
	ASSETS_SERVICE_NAME,
	ROUTER_SERVICE_NAME,
} from "./constants";
import { AssetsOptionsSchema } from "./schema";

export const ASSETS_PLUGIN: Plugin<typeof AssetsOptionsSchema> = {
	options: AssetsOptionsSchema,
	async getBindings(options: z.infer<typeof AssetsOptionsSchema>) {
		if (!options.assets?.bindingName) {
			return [];
		}
		return [
			{
				// binding between User Worker and Asset Worker
				name: options.assets.bindingName,
				service: { name: ASSETS_SERVICE_NAME },
			},
		];
	},

	async getNodeBindings(options) {
		if (!options.assets?.bindingName) {
			return {};
		}
		return {
			[options.assets.bindingName]: kProxyNodeBinding,
		};
	},

	async getServices({ options }) {
		if (!options.assets) {
			return [];
		}
		const assetsReverseMap = await createReverseMap(options.assets?.path);

		const storageServiceName = `${ASSETS_PLUGIN_NAME}:storage`;
		const storageService: Service = {
			name: storageServiceName,
			disk: { path: options.assets.path, writable: true },
		};
		const namespaceService: Service = {
			name: ASSETS_KV_SERVICE_NAME,
			worker: {
				compatibilityDate: "2023-07-24",
				compatibilityFlags: ["nodejs_compat"],
				modules: [
					{
						name: "assets-kv-worker.mjs",
						esModule: SCRIPT_ASSETS_KV(),
					},
				],
				bindings: [
					{
						name: SharedBindings.MAYBE_SERVICE_BLOBS,
						service: { name: storageServiceName },
					},
					{
						name: "ASSETS_REVERSE_MAP",
						json: assetsReverseMap,
					},
				],
			},
		};

		const assetsManifest = await buildAssetsManifest(options.assets.path);
		const assetService: Service = {
			name: ASSETS_SERVICE_NAME,
			worker: {
				compatibilityDate: "2024-08-01",
				modules: [
					{
						name: "asset-worker.mjs",
						esModule: SCRIPT_ASSETS(),
					},
				],
				bindings: [
					{
						name: "ASSETS_KV_NAMESPACE",
						kvNamespace: { name: ASSETS_KV_SERVICE_NAME },
					},
					{
						name: "ASSETS_MANIFEST",
						data: assetsManifest,
					},
				],
			},
		};

		const routerService: Service = {
			name: ROUTER_SERVICE_NAME,
			worker: {
				compatibilityDate: "2024-08-01",
				modules: [
					{
						name: "router-worker.mjs",
						esModule: SCRIPT_ROUTER(),
					},
				],
				bindings: [
					{
						name: "ASSET_WORKER",
						service: { name: ASSETS_SERVICE_NAME },
					},
					{
						name: "USER_WORKER",
						service: { name: getUserServiceName(options.assets.workerName) },
					},
					{
						name: "CONFIG",
						json: JSON.stringify(options.assets.routingConfig),
					},
				],
			},
		};

		return [storageService, namespaceService, assetService, routerService];
	},
};

// -- ASSET MANIFEST --
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

export const buildAssetsManifest = async (dir: string) => {
	const manifest = await walk(dir);
	const sortedAssetManifest = sortManifest(manifest);
	const encodedAssetManifest = encodeManifest(sortedAssetManifest);
	return encodedAssetManifest;
};

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

// -- ASSET REVERSE MAP --
//
// In prod, the contentHash is used as the key for the KV store that holds the assets.
// Asset Worker will hash the path of an incoming request, look for that pathHash in
// the stored manifest, and get the corresponding contentHash to use as the KV key.
// In dev, we fake out this KV store and just get the assets from disk. However we still need
// to map a given "contentHash" to the filePath. This is what the ASSET REVERSE MAP is for.
// This is available to the ASSETS_KV_NAMESPACE service (assets-kv.worker.ts) as a binding.

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
