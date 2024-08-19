import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { KVOptionsSchema } from "miniflare";
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
	const assetManifest = await walk(dir);
	const sortedAssetManifest = sortManifest(assetManifest);
	const encodedAssetManifest = encodeManifest(sortedAssetManifest);
	// to indicate it is in dev:
	encodedAssetManifest.set([1], 0);
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

export function getAssetsServices(options: AssetsOptions): Service[] {
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
			],
		},
	};
	return [storageService, namespaceService];
}

const MAX_ASSET_COUNT = 20_000;
const MAX_ASSET_SIZE = 25 * 1024 * 1024;
const MANIFEST_HEADER_SIZE = 20;

const PATH_HASH_OFFSET = 0;
const PATH_HASH_SIZE = 16;

const CONTENT_HASH_OFFSET = PATH_HASH_SIZE;
const CONTENT_HASH_SIZE = 16;

const TAIL_RESERVED_SIZE = 8;

const ENTRY_SIZE = PATH_HASH_SIZE + CONTENT_HASH_SIZE + TAIL_RESERVED_SIZE;

type AssetManifestEntry = { contentHash: Uint8Array; pathHash: Uint8Array };

const walk = async (dir: string) => {
	const files = await fs.readdir(dir, { recursive: true });
	const manifest: AssetManifestEntry[] = [];
	let counter = 0;
	await Promise.all(
		files.map(async (file) => {
			const filepath = path.join(dir, file);
			const relativeFilepath = path.relative(dir, filepath);
			const filestat = await fs.stat(filepath);

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
							`Cloudflare Workers supports assets with sizes of up to ${MAX_ASSET_SIZE}. We found a file ${filepath} with a size of ${filestat.size}.\n` +
							`Ensure all assets in your assets directory "${dir}" conform with the Workers maximum size requirement.`
					);
				}

				// not the same as deploy but more similar to what is stored in gcs
				manifest.push({
					contentHash: fakeHashFile(),
					pathHash: await hashPath(encodeFilePath(relativeFilepath)),
				});

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

// not actually needed in dev
const fakeHashFile = () => {
	const hashBuffer = new ArrayBuffer(CONTENT_HASH_SIZE);
	return new Uint8Array(hashBuffer, 0);
};

const encodeFilePath = (filePath: string) => {
	const encodedPath = filePath
		.split(path.sep)
		.map((segment) => encodeURIComponent(segment))
		.join("/");
	return "/" + encodedPath;
};

// sorts ascending by path hash
const sortManifest = (manifest: AssetManifestEntry[]) => {
	return manifest.sort(comparisonFn);
};

const comparisonFn = (a: AssetManifestEntry, b: AssetManifestEntry) => {
	// i don't see why this would ever be the case
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

const encodeManifest = (manifest: AssetManifestEntry[]) => {
	const assetManifestBytes = new Uint8Array(
		MANIFEST_HEADER_SIZE + manifest.length * ENTRY_SIZE
	);
	for (const [i, entry] of manifest.entries()) {
		const entryOffset = MANIFEST_HEADER_SIZE + i * ENTRY_SIZE;
		// NB: PATH_HASH_OFFSET = 0
		assetManifestBytes.set(entry.pathHash, entryOffset + PATH_HASH_OFFSET);
		assetManifestBytes.set(
			entry.contentHash,
			entryOffset + CONTENT_HASH_OFFSET
		);
	}
	return assetManifestBytes;
};
