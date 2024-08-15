import path from "node:path";
import SCRIPT_ASSETS from "worker:assets/assets";
import SCRIPT_FAKE_KV from "worker:assets/fake-kv";
import { Service, Worker_Binding } from "../../runtime";
import { kProxyNodeBinding, Plugin } from "../shared";
import {
	ASSETS_PLUGIN_NAME,
	ASSETS_SERVICE_NAME,
	FAKE_KV_SERVICE_NAME,
} from "./constants";
import { AssetsOptionsSchema, isWorkersWithAssets } from "./schema";

export const ASSETS_PLUGIN: Plugin<typeof AssetsOptionsSchema> = {
	options: AssetsOptionsSchema,
	async getBindings(options) {
		const bindings: Worker_Binding[] = [];
		if (isWorkersWithAssets(options)) {
			// Always add the default asset binding that will be used by the Router Worker.
			bindings.push({
				name: "__ASSETS__",
				service: { name: ASSETS_SERVICE_NAME },
			});
			if (options.assetsBindingName) {
				// Also add the custom named asset binding for the User Worker.
				bindings.push({
					name: options.assetsBindingName,
					service: { name: ASSETS_SERVICE_NAME },
				});
			}
		}
		return bindings;
	},

	async getNodeBindings(options) {
		const bindings: Record<string, symbol> = {};

		if (isWorkersWithAssets(options)) {
			// Always add the default asset binding that will be used by the Router Worker.
			bindings.__ASSETS__ = kProxyNodeBinding;
			if (options.assetsBindingName) {
				// Also add the custom named asset binding for the User Worker.
				bindings[options.assetsBindingName] = kProxyNodeBinding;
			}
		}
		return bindings;
	},

	async getServices({ options }) {
		const services: Service[] = [];
		if (isWorkersWithAssets(options)) {
			services.push(await getAssetService());
			services.push(...getFakeKVServices(path.resolve(options.assetsPath)));
		}
		return services;
	},
};

/**
 * This is a fake version of a KV Namespace that is used by the Asset Service to access the assets.
 *
 * It is backed by a Disk Directory storage service.
 */
function getFakeKVServices(assetsPath: string): Service[] {
	const FAKE_KV_STORAGE_SERVICE_NAME = `${ASSETS_PLUGIN_NAME}:storage`;
	console.error(assetsPath, path.resolve(assetsPath));
	return [
		{
			name: FAKE_KV_SERVICE_NAME,
			worker: {
				compatibilityDate: "2024-08-01",
				modules: [
					{
						name: "fake-kv-worker.mjs",
						esModule: SCRIPT_FAKE_KV(),
					},
				],
				bindings: [
					{
						name: FAKE_KV_STORAGE_SERVICE_NAME,
						service: { name: FAKE_KV_STORAGE_SERVICE_NAME },
					},
				],
			},
		},
		{
			name: FAKE_KV_STORAGE_SERVICE_NAME,
			disk: { path: path.resolve(assetsPath) },
		},
	];
}

/**
 * The "Asset Service" is what handles requests for static assets.
 *
 * It can either be the only service in an assets-only Worker,
 * Or it will be service-bound to the Routing Service and also often bound to the User Worker as an `ASSETS` binding.
 */
async function getAssetService(): Promise<Service> {
	// Do we actually need to pull in any fields from the asset-server worker's wrangler.toml?
	// We need to hard code the name and the bindings anyway, so we might as well keep anything else in sync manually as well.
	return {
		name: ASSETS_SERVICE_NAME,
		worker: {
			compatibilityDate: "2024-08-01",
			modules: [
				{
					name: "asset-server-worker.mjs",
					esModule: SCRIPT_ASSETS(),
				},
			],
			bindings: [
				{
					name: "ASSETS_KV_NAMESPACE",
					kvNamespace: { name: FAKE_KV_SERVICE_NAME },
				},
				{
					name: "ASSETS_MANIFEST",
					data: Uint8Array.from([]), // TODO - compute this
				},
			],
		},
	};
}
