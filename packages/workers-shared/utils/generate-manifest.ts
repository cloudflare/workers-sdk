import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import * as path from "node:path";
import { hash as blake3hash } from "blake3-wasm";
import { getType } from "mime";
import prettyBytes from "pretty-bytes";
import {
	CONTENT_HASH_OFFSET,
	ENTRY_SIZE,
	HEADER_SIZE,
	MAX_ASSET_COUNT,
	MAX_ASSET_SIZE,
	PATH_HASH_OFFSET,
	PATH_HASH_SIZE,
} from "./consts";

// There are three objects being created in this file
// 1. asset manifest (production)
// 2. asset manifest (dev)
// 3. asset manifest reverse map (dev)

// -- PRODUCTION ASSET MANIFEST --
// This is uploaded during `wrangler deploy`, and is further processed by EWC.

export type ProdAssetManifest = {
	[path: string]: { hash: string; size: number };
};

export const buildProdAssetsManifest = async (dir: string) => {
	const files = await readdir(dir, { recursive: true });
	const manifest: ProdAssetManifest = {};
	let counter = 0;
	await Promise.all(
		files.map(async (file) => {
			const filepath = path.join(dir, file);
			const relativeFilepath = path.relative(dir, filepath);
			const filestat = await stat(filepath);

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
				manifest[encodeFilePath(relativeFilepath)] = {
					hash: hashFile(filepath),
					size: filestat.size,
				};
				counter++;
			}
		})
	);
	return manifest;
};

const hashFile = (filepath: string) => {
	const contents = readFileSync(filepath);
	const base64Contents = contents.toString("base64");
	const extension = path.extname(filepath).substring(1);

	return blake3hash(base64Contents + extension)
		.toString("hex")
		.slice(0, 32);
};

export const encodeFilePath = (filePath: string) => {
	// NB windows will disallow these characters in file paths anyway < > : " / \ | ? *
	const encodedPath = filePath
		.split(path.sep)
		.map((segment) => encodeURIComponent(segment))
		.join("/");
	return "/" + encodedPath;
};

// -- DEV ASSET MANIFEST --
//
// This aims to emulate how EWC processes the production asset manifest.
//
// There are some differences however between the prod and dev manifest:
// In prod the manifest contains a pathHash and a contentHash. The
// contentHash is used for uploading and as the keys for the KV namespace
// where the assets are stored. Uploading is irrelevant in dev, so for
// performance reasons, the pathHash is reused for the "contentHash".
//
// This is available to asset service worker as a binding.

export const buildDevAssetsManifest = async (dir: string) => {
	const files = await readdir(dir, { recursive: true });
	const manifest: Uint8Array[] = [];
	let counter = 0;
	await Promise.all(
		files.map(async (file) => {
			const filepath = path.join(dir, file);
			const relativeFilepath = path.relative(dir, filepath);
			const filestat = await stat(filepath);

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

				manifest.push(await hashPathDev(encodeFilePath(relativeFilepath)));
				counter++;
			}
		})
	);
	const sortedAssetManifest = sortDevManifest(manifest);
	const encodedAssetManifest = encodeManifest(sortedAssetManifest);
	// to indicate it is in dev:
	encodedAssetManifest.set([1], 0);
	return encodedAssetManifest;
};

export const hashPathDev = async (path: string) => {
	const encoder = new TextEncoder();
	const data = encoder.encode(path);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data.buffer);
	return new Uint8Array(hashBuffer, 0, PATH_HASH_SIZE);
};

// sorts ascending by path hash
const sortDevManifest = (manifest: Uint8Array[]) => {
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
		HEADER_SIZE + manifest.length * ENTRY_SIZE
	);
	for (const [i, entry] of manifest.entries()) {
		const entryOffset = HEADER_SIZE + i * ENTRY_SIZE;
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
// ASW will hash the path of an incoming request, look for that pathHash in the stored manifest,
// and get the corresponding contentHash to use as the KV key.
// In dev, we fake out this KV store and just get the assets from disk. However we still need
// to map a given "contentHash" to the filePath. This is what the ASSET REVERSE MAP is for.
// This is available to the FAKE_KV_NAMESPACE service (assets.worker.ts) as a binding.

export type AssetReverseMap = {
	[pathHash: string]: { filePath: string; contentType: string };
};

export const createReverseMap = async (dir: string) => {
	const files = await readdir(dir, { recursive: true });
	const assetsReverseMap: AssetReverseMap = {};
	await Promise.all(
		files.map(async (file) => {
			const filepath = path.join(dir, file);
			const relativeFilepath = path.relative(dir, filepath);
			const filestat = await stat(filepath);

			if (filestat.isSymbolicLink() || filestat.isDirectory()) {
				return;
			} else {
				const pathHash = bytesToHex(
					await hashPathDev(encodeFilePath(relativeFilepath))
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

export const bytesToHex = (buffer: ArrayBufferLike) => {
	return [...new Uint8Array(buffer)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
};
