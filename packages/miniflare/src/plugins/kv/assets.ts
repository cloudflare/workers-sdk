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

export function buildAssetsManifest(): Uint8Array {
	const buffer = new ArrayBuffer(20);
	const assetManifest = new Uint8Array(buffer); // [0, 0, 0, ..., 0, 0]
	// this will signal to Asset Server Worker that its running in a
	// local dev "context"
	assetManifest.set([1], 0); // [1, 0, 0, ..., 0, 0]

	return assetManifest;
}

export async function getAssetsBindings(
	options: AssetsOptions
): Promise<Worker_Binding[]> {
	const assetsBindings = getAssetsBindingsNames(
		options?.assetsKVBindingName,
		options?.assetsManifestBindingName
	);

	const assetsManifest = buildAssetsManifest();

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
	const assetsManifest = buildAssetsManifest();
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
