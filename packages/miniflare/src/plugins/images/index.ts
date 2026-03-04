import fs from "node:fs/promises";
import SCRIPT_IMAGES_SERVICE from "worker:images/images";
import SCRIPT_KV_NAMESPACE_OBJECT from "worker:kv/namespace";
import { z } from "zod";
import { Service } from "../../runtime";
import { SharedBindings } from "../../workers";
import { KV_NAMESPACE_OBJECT_CLASS_NAME } from "../kv";
import {
	getMiniflareObjectBindings,
	getPersistPath,
	getUserBindingServiceName,
	objectEntryWorker,
	PersistenceSchema,
	Plugin,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	RemoteProxyConnectionString,
	SERVICE_LOOPBACK,
	WORKER_BINDING_SERVICE_LOOPBACK,
} from "../shared";

const ImagesSchema = z.object({
	binding: z.string(),
	remoteProxyConnectionString: z
		.custom<RemoteProxyConnectionString>()
		.optional(),
});

export const ImagesOptionsSchema = z.object({
	images: ImagesSchema.optional(),
});

export const ImagesSharedOptionsSchema = z.object({
	imagesPersist: PersistenceSchema,
});

export const IMAGES_PLUGIN_NAME = "images";

export const IMAGES_PLUGIN: Plugin<
	typeof ImagesOptionsSchema,
	typeof ImagesSharedOptionsSchema
> = {
	options: ImagesOptionsSchema,
	sharedOptions: ImagesSharedOptionsSchema,
	async getBindings(options) {
		if (!options.images) {
			return [];
		}

		return [
			{
				name: options.images.binding,
				wrapped: {
					moduleName: "cloudflare-internal:images-api",
					innerBindings: [
						{
							name: "fetcher",
							service: {
								name: getUserBindingServiceName(
									IMAGES_PLUGIN_NAME,
									options.images.binding,
									options.images.remoteProxyConnectionString
								),
							},
						},
					],
				},
			},
		];
	},
	getNodeBindings(options: z.infer<typeof ImagesOptionsSchema>) {
		if (!options.images) {
			return {};
		}
		return {
			[options.images.binding]: new ProxyNodeBinding(),
		};
	},
	async getServices({
		options,
		sharedOptions,
		tmpPath,
		defaultPersistRoot,
		unsafeStickyBlobs,
	}) {
		if (!options.images) {
			return [];
		}

		const serviceName = getUserBindingServiceName(
			IMAGES_PLUGIN_NAME,
			options.images.binding,
			options.images.remoteProxyConnectionString
		);

		if (options.images.remoteProxyConnectionString) {
			return [
				{
					name: serviceName,
					worker: remoteProxyClientWorker(
						options.images.remoteProxyConnectionString,
						options.images.binding
					),
				},
			];
		}

		const persistPath = getPersistPath(
			IMAGES_PLUGIN_NAME,
			tmpPath,
			defaultPersistRoot,
			sharedOptions.imagesPersist
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
					...getMiniflareObjectBindings(unsafeStickyBlobs),
				],
			},
		} satisfies Service;

		const kvNamespaceService = {
			name: `${IMAGES_PLUGIN_NAME}:ns:data`,
			worker: objectEntryWorker(
				{
					serviceName: objectService.name,
					className: KV_NAMESPACE_OBJECT_CLASS_NAME,
				},
				"images-data"
			),
		} satisfies Service;

		const imagesService = {
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
						kvNamespace: { name: kvNamespaceService.name },
					},
					WORKER_BINDING_SERVICE_LOOPBACK,
				],
			},
		} satisfies Service;

		return [storageService, objectService, kvNamespaceService, imagesService];
	},
	getPersistPath({ imagesPersist }, tmpPath) {
		return getPersistPath(
			IMAGES_PLUGIN_NAME,
			tmpPath,
			undefined,
			imagesPersist
		);
	},
};
