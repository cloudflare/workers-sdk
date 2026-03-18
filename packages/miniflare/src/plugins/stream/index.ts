import fs from "node:fs/promises";
import SCRIPT_D1_DATABASE_OBJECT from "worker:d1/database";
import SCRIPT_STREAM_BINDING from "worker:stream/binding";
import { z } from "zod";
import { Service } from "../../runtime";
import { SharedBindings } from "../../workers";
import {
	getMiniflareObjectBindings,
	getPersistPath,
	getUserBindingServiceName,
	migrateDatabase,
	objectEntryWorker,
	PersistenceSchema,
	Plugin,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	RemoteProxyConnectionString,
	SERVICE_LOOPBACK,
} from "../shared";

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
const STREAM_DATABASE_SERVICE_NAME = `${STREAM_PLUGIN_NAME}:db`;
const STREAM_DATABASE_OBJECT_CLASS_NAME = "D1DatabaseObject";

export const STREAM_PLUGIN: Plugin<
	typeof StreamOptionsSchema,
	typeof StreamSharedOptionsSchema
> = {
	options: StreamOptionsSchema,
	sharedOptions: StreamSharedOptionsSchema,
	getBindings(options) {
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
					...(options.stream.remoteProxyConnectionString
						? {}
						: { entrypoint: "StreamBindingEntrypoint" }),
					props: {
						binding: options.stream.binding,
					},
				},
			},
		];
	},
	getNodeBindings(options) {
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
		log,
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

		const storageService = {
			name: STREAM_STORAGE_SERVICE_NAME,
			disk: { path: persistPath, writable: true },
		} satisfies Service;

		const databaseObjectUniqueKey = `miniflare-stream-${STREAM_DATABASE_OBJECT_CLASS_NAME}`;
		const databaseObjectService = {
			name: STREAM_DATABASE_SERVICE_NAME,
			worker: {
				compatibilityDate: "2026-03-16",
				compatibilityFlags: ["nodejs_compat", "experimental"],
				modules: [
					{
						name: "database.worker.js",
						esModule: SCRIPT_D1_DATABASE_OBJECT(),
					},
				],
				durableObjectNamespaces: [
					{
						className: STREAM_DATABASE_OBJECT_CLASS_NAME,
						uniqueKey: databaseObjectUniqueKey,
					},
				],
				durableObjectStorage: { localDisk: STREAM_STORAGE_SERVICE_NAME },
				bindings: [
					{
						name: SharedBindings.MAYBE_SERVICE_BLOBS,
						service: { name: STREAM_STORAGE_SERVICE_NAME },
					},
					{
						name: SharedBindings.MAYBE_SERVICE_LOOPBACK,
						service: { name: SERVICE_LOOPBACK },
					},
					...getMiniflareObjectBindings(unsafeStickyBlobs),
				],
			},
		} satisfies Service;

		const databaseServiceName = `${STREAM_PLUGIN_NAME}:db:data:${options.stream.binding}`;
		const databaseEntryService = {
			name: databaseServiceName,
			worker: objectEntryWorker(
				{
					serviceName: STREAM_DATABASE_SERVICE_NAME,
					className: STREAM_DATABASE_OBJECT_CLASS_NAME,
				},
				options.stream.binding
			),
		} satisfies Service;

		const streamService = {
			name: serviceName,
			worker: {
				compatibilityDate: "2026-03-16",
				compatibilityFlags: ["nodejs_compat"],
				modules: [
					{
						name: "binding.worker.js",
						esModule: SCRIPT_STREAM_BINDING(),
					},
				],
				bindings: [
					{
						name: "STREAM_DB",
						wrapped: {
							moduleName: "cloudflare-internal:d1-api",
							innerBindings: [
								{
									name: "fetcher",
									service: { name: databaseServiceName },
								},
							],
						},
					},
					{
						name: "STREAM_BINDING_NAME",
						text: options.stream.binding,
					},
					{
						name: SharedBindings.MAYBE_SERVICE_BLOBS,
						service: { name: STREAM_STORAGE_SERVICE_NAME },
					},
				],
			},
		} satisfies Service;

		await migrateDatabase(
			log,
			databaseObjectUniqueKey,
			persistPath,
			options.stream.binding
		);

		return [
			storageService,
			databaseObjectService,
			databaseEntryService,
			streamService,
		];
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
