import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
	CONTENT_HASH_OFFSET,
	ENTRY_SIZE,
	getContentType,
	HEADER_SIZE,
	MAX_ASSET_COUNT,
	MAX_ASSET_SIZE,
	normalizeFilePath,
	PATH_HASH_OFFSET,
	PATH_HASH_SIZE,
} from "@cloudflare/workers-shared";
import prettyBytes from "pretty-bytes";
import SCRIPT_ASSETS from "worker:assets/assets";
import SCRIPT_ASSETS_KV from "worker:assets/assets-kv";
import SCRIPT_ROUTER from "worker:assets/router";
import { z } from "zod";
import { Service } from "../../runtime";
import { SharedBindings } from "../../workers";
import { getUserServiceName } from "../core";
import { Plugin, ProxyNodeBinding } from "../shared";
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
		if (!options.assets?.binding) {
			return [];
		}
		return [
			{
				// binding between User Worker and Asset Worker
				name: options.assets.binding,
				service: {
					name: `${ASSETS_SERVICE_NAME}-${options.assets.workerName}`,
				},
			},
		];
	},

	async getNodeBindings(options) {
		if (!options.assets?.binding) {
			return {};
		}
		return {
			[options.assets.binding]: new ProxyNodeBinding(),
		};
	},

	async getServices({ options }) {
		if (!options.assets) {
			return [];
		}

		const storageServiceName = `${ASSETS_PLUGIN_NAME}:storage`;
		const storageService: Service = {
			name: storageServiceName,
			disk: { path: options.assets.directory, writable: true },
		};

		const { encodedAssetManifest, assetsReverseMap } = await buildAssetManifest(
			options.assets.directory
		);

		const namespaceService: Service = {
			name: `${ASSETS_KV_SERVICE_NAME}-${options.assets.workerName}`,
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
						json: JSON.stringify(assetsReverseMap),
					},
				],
			},
		};

		const assetService: Service = {
			name: `${ASSETS_SERVICE_NAME}-${options.assets.workerName}`,
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
						kvNamespace: {
							name: `${ASSETS_KV_SERVICE_NAME}-${options.assets.workerName}`,
						},
					},
					{
						name: "ASSETS_MANIFEST",
						data: encodedAssetManifest,
					},
					{
						name: "CONFIG",
						json: JSON.stringify(options.assets.assetConfig ?? {}),
					},
				],
			},
		};

		const routerService: Service = {
			name: `${ROUTER_SERVICE_NAME}-${options.assets.workerName}`,
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
						service: {
							name: `${ASSETS_SERVICE_NAME}-${options.assets.workerName}`,
						},
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

/**
 * The Asset Manifest and Asset Reverse Map are used to map a request path to an asset.
 * 1. Hash path of request
 * 2. Use this path hash to find the manifest entry
 * 3. Get content hash from manifest entry
 * 4a. In prod, use content hash to get asset from KV
 * 4b. In dev, we fake out the KV store and use the file system instead.
 * 	   Use content hash to get file path from asset reverse map.
 */

export const buildAssetManifest = async (dir: string) => {
	const { manifest, assetsReverseMap } = await walk(dir);
	const sortedAssetManifest = sortManifest(manifest);
	const encodedAssetManifest = encodeManifest(sortedAssetManifest);
	return { encodedAssetManifest, assetsReverseMap };
};

export type ManifestEntry = {
	pathHash: Uint8Array;
	contentHash: Uint8Array;
};

export type AssetReverseMap = {
	[pathHash: string]: { filePath: string; contentType: string };
};

/**
 * Traverses the asset directory to create an asset manifest and asset reverse map.
 * These are available to the Asset Worker as a binding.
 * NB: This runs every time the dev server restarts.
 */
const walk = async (dir: string) => {
	const files = await fs.readdir(dir, { recursive: true });
	const manifest: ManifestEntry[] = [];
	const assetsReverseMap: AssetReverseMap = {};
	let counter = 0;
	await Promise.all(
		files.map(async (file) => {
			/** absolute file path */
			const filepath = path.join(dir, file);
			const relativeFilepath = path.relative(dir, filepath);
			const filestat = await fs.stat(filepath);

			// TODO: decide whether to follow symbolic links
			if (filestat.isSymbolicLink() || filestat.isDirectory()) {
				return;
			} else {
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

				/*
				 * Each manifest entry is a series of bytes that store data in a [header,
				 * pathHash, contentHash] format, where:
				 *   - `header` is a fixed 20 bytes reserved but currently unused
				 *   - `pathHash` is the hashed file path
				 *   - `contentHash` is the hashed file content in prod
				 *
				 * The `contentHash` of a file is determined by reading the contents of
				 * the file, and applying a hash function on the read data. In local
				 * development, performing this operation for each asset file would
				 * become very expensive very quickly, as it would have to be performed
				 * every time a dev server reload is trigerred. In watch mode, depending
				 * on the user's setup, this could potentially be on every file change.
				 *
				 * To avoid this from becoming a performance bottleneck, we're doing
				 * things a bit differently for dev, and implementing the `contentHash`
				 * as a hash function of the file path and the modified timestamp.
				 * (`hash(filePath + modifiedTime)`).
				 * This way a file's corresponding 'contentHash' will always update
				 * if the file changes, and `wrangler dev` will serve the updated asset
				 * files instead of incorrectly returning 304s.
				 */

				const [pathHash, contentHash] = await Promise.all([
					hashPath(normalizeFilePath(relativeFilepath)),
					// used absolute filepath here so that changes to the enclosing asset folder will be registered
					hashPath(filepath + filestat.mtimeMs.toString()),
				]);
				manifest.push({
					pathHash,
					contentHash,
				});
				assetsReverseMap[bytesToHex(contentHash)] = {
					filePath: relativeFilepath,
					contentType: getContentType(filepath),
				};
				counter++;
			}
		})
	);
	if (counter > MAX_ASSET_COUNT) {
		throw new Error(
			`Maximum number of assets exceeded.\n` +
				`Cloudflare Workers supports up to ${MAX_ASSET_COUNT.toLocaleString()} assets in a version. We found ${counter.toLocaleString()} files in the specified assets directory "${dir}".\n` +
				`Ensure your assets directory contains a maximum of ${MAX_ASSET_COUNT.toLocaleString()} files, and that you have specified your assets directory correctly.`
		);
	}
	return { manifest, assetsReverseMap };
};

// sorts ascending by path hash
const sortManifest = (manifest: ManifestEntry[]) => {
	return manifest.sort(comparisonFn);
};

const comparisonFn = (a: ManifestEntry, b: ManifestEntry) => {
	if (a.pathHash.length < b.pathHash.length) {
		return -1;
	}
	if (a.pathHash.length > b.pathHash.length) {
		return 1;
	}
	for (const [i, v] of a.pathHash.entries()) {
		if (v < b.pathHash[i]) {
			return -1;
		}
		if (v > b.pathHash[i]) {
			return 1;
		}
	}
	return 1;
};

const encodeManifest = (manifest: ManifestEntry[]) => {
	const assetManifestBytes = new Uint8Array(
		HEADER_SIZE + manifest.length * ENTRY_SIZE
	);

	for (const [i, entry] of manifest.entries()) {
		const entryOffset = HEADER_SIZE + i * ENTRY_SIZE;
		assetManifestBytes.set(entry.pathHash, entryOffset + PATH_HASH_OFFSET);
		// content hash here in dev is hash(path + last modified time of file)
		assetManifestBytes.set(
			entry.contentHash,
			entryOffset + CONTENT_HASH_OFFSET
		);
	}
	return assetManifestBytes;
};

const bytesToHex = (buffer: ArrayBufferLike) => {
	return [...new Uint8Array(buffer)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
};

const hashPath = async (path: string) => {
	const encoder = new TextEncoder();
	const data = encoder.encode(path);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data.buffer);
	return new Uint8Array(hashBuffer, 0, PATH_HASH_SIZE);
};
