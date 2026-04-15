import fs from "node:fs/promises";
import BINDING_SCRIPT from "worker:stream/binding";
import OBJECT_SCRIPT from "worker:stream/object";
import { z } from "zod";
import { SharedBindings } from "../../workers";
import {
	getMiniflareObjectBindings,
	getPersistPath,
	getUserBindingServiceName,
	PersistenceSchema,
	ProxyNodeBinding,
	remoteProxyClientWorker,
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
const STREAM_STORAGE_SERVICE_NAME = `${STREAM_PLUGIN_NAME}:storage`;
const STREAM_OBJECT_SERVICE_NAME = `${STREAM_PLUGIN_NAME}:object`;
export const STREAM_OBJECT_CLASS_NAME = "StreamObject";

export const STREAM_COMPAT_DATE = "2026-03-23";

export const STREAM_PLUGIN: Plugin<
	typeof StreamOptionsSchema,
	typeof StreamSharedOptionsSchema
> = {
	options: StreamOptionsSchema,
	sharedOptions: StreamSharedOptionsSchema,
	async getBindings(options) {
		if (!options.stream) {
			return [];
		}

		return [
			{
				name: options.stream.binding,
				service: {
					name: getUserBindingServiceName(
						STREAM_PLUGIN_NAME,
						options.stream.binding,
						options.stream.remoteProxyConnectionString
					),
					entrypoint: options.stream.remoteProxyConnectionString
						? undefined
						: "StreamBinding",
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
	}) {
		if (!options.stream) {
			return [];
		}

		const serviceName = getUserBindingServiceName(
			STREAM_PLUGIN_NAME,
			options.stream.binding,
			options.stream.remoteProxyConnectionString
		);

		if (options.stream.remoteProxyConnectionString) {
			return [
				{
					name: serviceName,
					worker: remoteProxyClientWorker(
						options.stream.remoteProxyConnectionString,
						options.stream.binding
					),
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
			name: serviceName,
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
