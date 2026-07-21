import fs from "node:fs/promises";
import SCRIPT_IMAGES_SERVICE from "worker:images/images";
import SCRIPT_KV_NAMESPACE_OBJECT from "worker:kv/namespace";
import { z } from "zod";
import { SharedBindings } from "../../workers";
import { KV_NAMESPACE_OBJECT_CLASS_NAME } from "../kv";
import {
	buildRemoteProxyProps,
	getMiniflareObjectBindings,
	getPersistPath,
	getUserBindingServiceName,
	objectEntryWorker,
	PersistenceSchema,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	SERVICE_LOOPBACK,
	WORKER_BINDING_SERVICE_LOOPBACK,
} from "../shared";
import type { Service } from "../../runtime";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

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
const IMAGES_REMOTE_SERVICE_NAME = `${IMAGES_PLUGIN_NAME}:remote`;
// Fixed namespace backing the Images store (one per instance/owner).
const IMAGES_DATA_NAMESPACE = "images-data";
// The object-entry service exposing the Images store. Referenced by the shared
// storage owner so it can serve a routed client's Images KV operations.
export const IMAGES_NS_DATA_SERVICE_NAME = `${IMAGES_PLUGIN_NAME}:ns:data`;

export const IMAGES_PLUGIN: Plugin<
	typeof ImagesOptionsSchema,
	typeof ImagesSharedOptionsSchema
> = {
	options: ImagesOptionsSchema,
	sharedOptions: ImagesSharedOptionsSchema,
	bindingTypeDescription: "Images",
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
							service: options.images.remoteProxyConnectionString
								? {
										name: IMAGES_REMOTE_SERVICE_NAME,
										props: buildRemoteProxyProps(
											options.images.remoteProxyConnectionString,
											options.images.binding
										),
									}
								: {
										name: getUserBindingServiceName(
											IMAGES_PLUGIN_NAME,
											options.images.binding
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
		storageOwnerRoutePlugins,
		storageOwnerConn,
	}) {
		if (!options.images) {
			return [];
		}

		// Routed to the shared storage owner: keep the transform worker local but
		// repoint its backing KV store (`IMAGES_STORE`) at the owner, and skip the
		// local storage/object services (the owner stands them up).
		if (
			storageOwnerRoutePlugins.has(IMAGES_PLUGIN_NAME) &&
			storageOwnerConn !== undefined
		) {
			return [
				{
					name: IMAGES_REMOTE_SERVICE_NAME,
					worker: remoteProxyClientWorker(),
				},
				{
					name: getUserBindingServiceName(
						IMAGES_PLUGIN_NAME,
						options.images.binding
					),
					worker: {
						compatibilityDate: "2025-04-01",
						modules: [
							{ name: "images.worker.js", esModule: SCRIPT_IMAGES_SERVICE() },
						],
						bindings: [
							{
								name: "IMAGES_STORE",
								kvNamespace: {
									name: IMAGES_REMOTE_SERVICE_NAME,
									props: buildRemoteProxyProps(
										storageOwnerConn,
										`images:${IMAGES_DATA_NAMESPACE}`
									),
								},
							},
							WORKER_BINDING_SERVICE_LOOPBACK,
						],
					},
				},
			];
		}

		if (options.images.remoteProxyConnectionString) {
			return [
				{
					name: IMAGES_REMOTE_SERVICE_NAME,
					worker: remoteProxyClientWorker(),
				},
			];
		}

		const serviceName = getUserBindingServiceName(
			IMAGES_PLUGIN_NAME,
			options.images.binding
		);

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
			name: IMAGES_NS_DATA_SERVICE_NAME,
			worker: objectEntryWorker(
				{
					serviceName: objectService.name,
					className: KV_NAMESPACE_OBJECT_CLASS_NAME,
				},
				IMAGES_DATA_NAMESPACE
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
	getStorageOwnerHosting(allOptions) {
		const hasLocal = allOptions.some(
			(options) => options.images && !options.images.remoteProxyConnectionString
		);
		if (!hasLocal) {
			return undefined;
		}
		// One images store per owner (binding name irrelevant). Served via the
		// fetch path like KV, under the "images" key. Note the client side is
		// handled in `getServices` (the transform worker stays local, only its
		// backing KV store is repointed at the owner), so there is no
		// `routeBindingToStorageOwner` hook.
		return {
			ownerOptions: { images: { binding: "images" } },
			ownerBindings: [
				{ name: "images", service: { name: IMAGES_NS_DATA_SERVICE_NAME } },
			],
		};
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
