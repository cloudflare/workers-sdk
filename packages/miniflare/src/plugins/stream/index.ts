import fs from "node:fs/promises";
import BINDING_SCRIPT from "worker:stream/binding";
import OBJECT_SCRIPT from "worker:stream/object";
import { z } from "zod";
import { SharedBindings } from "../../workers";
import {
	buildRemoteProxyProps,
	getMiniflareObjectBindings,
	getPersistPath,
	getUserBindingServiceName,
	PersistenceSchema,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	WORKER_BINDING_SERVICE_LOOPBACK,
} from "../shared";
import type { Service } from "../../runtime";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

const StreamSchema = z.object({
	binding: z.string(),
	remoteProxyConnectionString: z
		.custom<RemoteProxyConnectionString>()
		.optional(),
});

export const StreamOptionsSchema = z.object({
	stream: StreamSchema.optional(),
});

export const StreamSharedOptionsSchema = z.object({
	streamPersist: PersistenceSchema,
});

export const STREAM_PLUGIN_NAME = "stream";
const STREAM_REMOTE_SERVICE_NAME = `${STREAM_PLUGIN_NAME}:remote`;
const STREAM_STORAGE_SERVICE_NAME = `${STREAM_PLUGIN_NAME}:storage`;
const STREAM_OBJECT_SERVICE_NAME = `${STREAM_PLUGIN_NAME}:object`;
export const STREAM_OBJECT_CLASS_NAME = "StreamObject";
// The RPC entrypoint service exposing the stream store. Referenced by the
// shared storage owner so it can route a client's Stream binding here.
export const STREAM_BINDING_SERVICE_NAME = `${STREAM_PLUGIN_NAME}:service`;
export const STREAM_BINDING_ENTRYPOINT = "StreamBinding";

export const STREAM_COMPAT_DATE = "2026-03-23";

export const STREAM_PLUGIN: Plugin<
	typeof StreamOptionsSchema,
	typeof StreamSharedOptionsSchema
> = {
	options: StreamOptionsSchema,
	sharedOptions: StreamSharedOptionsSchema,
	bindingTypeDescription: "Stream",
	async getBindings(options) {
		if (!options.stream) {
			return [];
		}

		return [
			{
				name: options.stream.binding,
				service: options.stream.remoteProxyConnectionString
					? {
							name: STREAM_REMOTE_SERVICE_NAME,
							props: buildRemoteProxyProps(
								options.stream.remoteProxyConnectionString,
								options.stream.binding
							),
						}
					: {
							name: getUserBindingServiceName(STREAM_PLUGIN_NAME, "service"),
							entrypoint: "StreamBinding",
						},
			},
		];
	},
	getNodeBindings(options: z.infer<typeof StreamOptionsSchema>) {
		if (!options.stream) {
			return {};
		}
		return {
			[options.stream.binding]: new ProxyNodeBinding(),
		};
	},
	async getServices({
		options,
		sharedOptions,
		tmpPath,
		defaultPersistRoot,
		unsafeStickyBlobs,
		storageOwnerRoutePlugins,
	}) {
		if (!options.stream) {
			return [];
		}

		// Routed to the shared storage owner: the owner stands up the stream
		// store and entrypoint; this instance's binding is repointed at the owner
		// proxy by `Miniflare`, so skip standing up local storage here.
		if (storageOwnerRoutePlugins.has(STREAM_PLUGIN_NAME)) {
			return [];
		}

		if (options.stream.remoteProxyConnectionString) {
			return [
				{
					name: STREAM_REMOTE_SERVICE_NAME,
					worker: remoteProxyClientWorker(),
				},
			];
		}

		const persistPath = getPersistPath(
			STREAM_PLUGIN_NAME,
			tmpPath,
			defaultPersistRoot,
			sharedOptions.streamPersist
		);
		await fs.mkdir(persistPath, { recursive: true });

		// Disk storage for blobs and SQL
		const storageService = {
			name: STREAM_STORAGE_SERVICE_NAME,
			disk: { path: persistPath, writable: true },
		} satisfies Service;

		// StreamObject
		const objectService = {
			name: STREAM_OBJECT_SERVICE_NAME,
			worker: {
				compatibilityDate: STREAM_COMPAT_DATE,
				compatibilityFlags: ["nodejs_compat", "experimental"],
				modules: [
					{
						name: "object.worker.js",
						esModule: OBJECT_SCRIPT(),
					},
				],
				durableObjectNamespaces: [
					{
						className: STREAM_OBJECT_CLASS_NAME,
						uniqueKey: `miniflare-${STREAM_OBJECT_CLASS_NAME}`,
						enableSql: true,
					},
				],
				durableObjectStorage: { localDisk: STREAM_STORAGE_SERVICE_NAME },
				bindings: [
					{
						name: SharedBindings.MAYBE_SERVICE_BLOBS,
						service: { name: STREAM_STORAGE_SERVICE_NAME },
					},
					...getMiniflareObjectBindings(unsafeStickyBlobs),
				],
				// Allow the DO to send outbound HTTP requests (fetching watermark images)
				globalOutbound: { name: "internet" },
			},
		} satisfies Service;

		// Entrypoint with RPC
		const bindingService = {
			name: getUserBindingServiceName(
				STREAM_PLUGIN_NAME,
				"service",
				options.stream.remoteProxyConnectionString
			),
			worker: {
				compatibilityDate: STREAM_COMPAT_DATE,
				compatibilityFlags: ["nodejs_compat", "experimental"],
				modules: [
					{
						name: "binding.worker.js",
						esModule: BINDING_SCRIPT(),
					},
				],
				bindings: [
					{
						name: "store",
						durableObjectNamespace: {
							className: STREAM_OBJECT_CLASS_NAME,
							serviceName: STREAM_OBJECT_SERVICE_NAME,
						},
					},
					WORKER_BINDING_SERVICE_LOOPBACK,
				],
				// Allow the binding worker to send outbound HTTP requests
				// (e.g. fetching video from URL in upload fn)
				globalOutbound: { name: "internet" },
			},
		} satisfies Service;

		return [storageService, objectService, bindingService];
	},
	getPersistPath({ streamPersist }, tmpPath) {
		return getPersistPath(
			STREAM_PLUGIN_NAME,
			tmpPath,
			undefined,
			streamPersist
		);
	},
};
