import fs from "node:fs/promises";
import SCRIPT_IMAGES_SERVICE from "worker:images/images";
import SCRIPT_KV_NAMESPACE_OBJECT from "worker:kv/namespace";
import { SharedBindings } from "../../workers";
import { KV_NAMESPACE_OBJECT_CLASS_NAME } from "../kv";
import {
	buildObjectEntryProps,
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getMiniflareObjectBindings,
	getPersistPath,
	getRemoteProxyConnectionString,
	getStorageService,
	getUserBindingServiceName,
	objectEntryWorker,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	SERVICE_LOOPBACK,
	WORKER_BINDING_SERVICE_LOOPBACK,
} from "../shared";
import type { Service } from "../../runtime";
import type { Plugin } from "../shared";

export const IMAGES_PLUGIN_NAME = "images";
const IMAGES_REMOTE_SERVICE_NAME = `${IMAGES_PLUGIN_NAME}:remote`;
const IMAGES_DATA_NAMESPACE = "images-data";
const IMAGES_DATA_SERVICE_NAME = `${IMAGES_PLUGIN_NAME}:ns:data`;

export function getImagesBindingServiceName(name: string): string {
	return getUserBindingServiceName(IMAGES_PLUGIN_NAME, `binding:${name}`);
}

export const IMAGES_PLUGIN: Plugin = {
	bindingTypeDescription: "Images",
	async getBindings(options) {
		return getEnvBindingsOfType(options.config, "images").map(
			([name, binding]) => {
				const remoteProxyConnectionString = getRemoteProxyConnectionString(
					binding,
					options.dev
				);
				return {
					name,
					wrapped: {
						moduleName: "cloudflare-internal:images-api",
						innerBindings: [
							{
								name: "fetcher",
								service: remoteProxyConnectionString
									? {
											name: IMAGES_REMOTE_SERVICE_NAME,
											props: buildRemoteProxyProps(
												remoteProxyConnectionString,
												name
											),
										}
									: {
											name: getImagesBindingServiceName(name),
										},
							},
						],
					},
				};
			}
		);
	},
	getNodeBindings(options) {
		return Object.fromEntries(
			getEnvBindingsOfType(options.config, "images").map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options, tmpPath, sharedOptions }) {
		const services: Service[] = [];

		const imagesBindings = getEnvBindingsOfType(options.config, "images");
		const hasLocalImages = imagesBindings.some(
			([, binding]) =>
				getRemoteProxyConnectionString(binding, options.dev) === undefined
		);

		for (const [name, binding] of imagesBindings) {
			const remoteProxyConnectionString = getRemoteProxyConnectionString(
				binding,
				options.dev
			);

			if (remoteProxyConnectionString) {
				services.push({
					name: IMAGES_REMOTE_SERVICE_NAME,
					worker: remoteProxyClientWorker(),
				});
				continue;
			}

			const serviceName = getImagesBindingServiceName(name);
			services.push({
				name: serviceName,
				worker: {
					compatibilityDate: "2025-04-01",
					modules: [
						{
							name: "images.worker.js",
							esModule: SCRIPT_IMAGES_SERVICE(),
						},
					],
					bindings: [
						{
							name: "IMAGES_STORE",
							kvNamespace: getStorageService(
								IMAGES_DATA_SERVICE_NAME,
								buildObjectEntryProps(IMAGES_DATA_NAMESPACE),
								sharedOptions
							),
						},
						WORKER_BINDING_SERVICE_LOOPBACK,
					],
				},
			});
		}

		if (!hasLocalImages && !sharedOptions.unsafeEnableSharedStorage) {
			return services;
		}

		const persistPath = getPersistPath(
			IMAGES_PLUGIN_NAME,
			tmpPath,
			sharedOptions.resourcePersistencePath
		);

		await fs.mkdir(persistPath, { recursive: true });

		const storageService = {
			name: `${IMAGES_PLUGIN_NAME}:storage`,
			disk: { path: persistPath, writable: true },
		} satisfies Service;

		const objectService = {
			name: `${IMAGES_PLUGIN_NAME}:ns`,
			worker: {
				compatibilityDate: "2023-07-24",
				compatibilityFlags: ["nodejs_compat", "experimental"],
				modules: [
					{
						name: "namespace.worker.js",
						esModule: SCRIPT_KV_NAMESPACE_OBJECT(),
					},
				],
				durableObjectNamespaces: [
					{
						className: KV_NAMESPACE_OBJECT_CLASS_NAME,
						uniqueKey: `miniflare-images-${KV_NAMESPACE_OBJECT_CLASS_NAME}`,
					},
				],
				durableObjectStorage: { localDisk: storageService.name },
				bindings: [
					{
						name: SharedBindings.MAYBE_SERVICE_BLOBS,
						service: { name: storageService.name },
					},
					{
						name: SharedBindings.MAYBE_SERVICE_LOOPBACK,
						service: { name: SERVICE_LOOPBACK },
					},
					...getMiniflareObjectBindings(),
				],
			},
		} satisfies Service;

		const kvNamespaceService = {
			name: IMAGES_DATA_SERVICE_NAME,
			worker: objectEntryWorker({
				serviceName: objectService.name,
				className: KV_NAMESPACE_OBJECT_CLASS_NAME,
			}),
		} satisfies Service;

		services.push(storageService, objectService, kvNamespaceService);

		return services;
	},
};
