import fs from "fs/promises";
import path from "path";
import { KVOptionsSchema } from "miniflare";
import SCRIPT_KV_ASSETS from "worker:kv/assets";
import { z } from "zod";
import { Service, Worker_Binding } from "../../runtime";
import { AssetsBindings, encodeAssetsKey, SharedBindings } from "../../workers";
import { kProxyNodeBinding } from "../shared";
import { KV_PLUGIN_NAME } from "./constants";

export interface AssetsOptions {
	assetsPath: string;
}

export function isWorkersWithAssets(
	options: z.infer<typeof KVOptionsSchema>
): options is AssetsOptions {
	return options.assetsPath !== undefined;
}

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

const SERVICE_NAMESPACE_ASSET = `${KV_PLUGIN_NAME}:asset`;

async function buildStaticContentManifest(assetsPath: string) {
	// Build __STATIC_CONTENT_MANIFEST contents
	const staticContentManifest: Record<string, string> = {};
	for await (const key of listKeysInDirectory(assetsPath)) {
		staticContentManifest[key] = encodeAssetsKey(key);
	}
	return staticContentManifest;
}

export async function getAssetsBindings(
	options: AssetsOptions
): Promise<Worker_Binding[]> {
	const __STATIC_CONTENT_MANIFEST = await buildStaticContentManifest(
		options.assetsPath
	);

	return [
		{
			name: AssetsBindings.KV_NAMESPACE_ASSET,
			kvNamespace: { name: SERVICE_NAMESPACE_ASSET },
		},
		{
			name: AssetsBindings.JSON_ASSET_MANIFEST,
			json: JSON.stringify(__STATIC_CONTENT_MANIFEST),
		},
	];
}

export async function getAssetsNodeBindings(
	options: AssetsOptions
): Promise<Record<string, unknown>> {
	const __STATIC_CONTENT_MANIFEST = await buildStaticContentManifest(
		options.assetsPath
	);

	return {
		[AssetsBindings.KV_NAMESPACE_ASSET]: kProxyNodeBinding,
		[AssetsBindings.JSON_ASSET_MANIFEST]: __STATIC_CONTENT_MANIFEST,
	};
}

export function getAssetsServices(options: AssetsOptions): Service[] {
	// Use unsanitised file storage to ensure file names containing e.g. dots
	// resolve correctly.
	const persist = path.resolve(options.assetsPath);

	const storageServiceName = `${SERVICE_NAMESPACE_ASSET}:storage`;
	const storageService: Service = {
		name: storageServiceName,
		disk: { path: persist, writable: true },
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
