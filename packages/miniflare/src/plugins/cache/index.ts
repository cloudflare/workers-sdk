import fs from "node:fs/promises";
import SCRIPT_CACHE_OBJECT from "worker:cache/cache";
import SCRIPT_CACHE_ENTRY from "worker:cache/cache-entry";
import SCRIPT_CACHE_ENTRY_NOOP from "worker:cache/cache-entry-noop";
import * as z from "zod/v4";
import {
	Service,
	Worker,
	Worker_Binding_DurableObjectNamespaceDesignator,
} from "../../runtime";
import { CacheBindings, SharedBindings } from "../../workers";
import {
	getMiniflareObjectBindings,
	getPersistPath,
	PersistenceSchema,
	Plugin,
	SERVICE_LOOPBACK,
} from "../shared";

export const CacheOptionsSchema = z.object({
	cache: z.boolean().optional(),
	cacheWarnUsage: z.boolean().optional(),
});
export const CacheSharedOptionsSchema = z.object({
	cachePersist: PersistenceSchema,
});

export const CACHE_PLUGIN_NAME = "cache";
const CACHE_STORAGE_SERVICE_NAME = `${CACHE_PLUGIN_NAME}:storage`;
const CACHE_SERVICE_PREFIX = `${CACHE_PLUGIN_NAME}:cache`;

const CACHE_OBJECT_CLASS_NAME = "CacheObject";
const CACHE_OBJECT: Worker_Binding_DurableObjectNamespaceDesignator = {
	serviceName: CACHE_SERVICE_PREFIX,
	className: CACHE_OBJECT_CLASS_NAME,
};

export function getCacheServiceName(workerIndex: number) {
	return `${CACHE_PLUGIN_NAME}:${workerIndex}`;
}

export const CACHE_PLUGIN: Plugin<
	typeof CacheOptionsSchema,
	typeof CacheSharedOptionsSchema
> = {
	options: CacheOptionsSchema,
	sharedOptions: CacheSharedOptionsSchema,
	getBindings() {
		return [];
	},
	getNodeBindings() {
		return {};
	},
	async getServices({
		sharedOptions,
		options,
		workerIndex,
		tmpPath,
		defaultPersistRoot,
		unsafeStickyBlobs,
	}) {
		const cache = options.cache ?? true;
		const cacheWarnUsage = options.cacheWarnUsage ?? false;

		let entryWorker: Worker;
		if (cache) {
			entryWorker = {
				compatibilityDate: "2023-07-24",
				compatibilityFlags: ["nodejs_compat", "experimental"],
				modules: [
					{ name: "cache-entry.worker.js", esModule: SCRIPT_CACHE_ENTRY() },
				],
				bindings: [
					{
						name: SharedBindings.DURABLE_OBJECT_NAMESPACE_OBJECT,
						durableObjectNamespace: CACHE_OBJECT,
					},
					{
						name: CacheBindings.MAYBE_JSON_CACHE_WARN_USAGE,
						json: JSON.stringify(cacheWarnUsage),
					},
				],
			};
		} else {
			entryWorker = {
				compatibilityDate: "2023-07-24",
				compatibilityFlags: ["nodejs_compat", "experimental"],
				modules: [
					{
						name: "cache-entry-noop.worker.js",
						esModule: SCRIPT_CACHE_ENTRY_NOOP(),
					},
				],
			};
		}
		const services: Service[] = [
			{ name: getCacheServiceName(workerIndex), worker: entryWorker },
		];

		if (cache) {
			const uniqueKey = `miniflare-${CACHE_OBJECT_CLASS_NAME}`;

			const persist = sharedOptions.cachePersist;
			const persistPath = getPersistPath(
				CACHE_PLUGIN_NAME,
				tmpPath,
				defaultPersistRoot,
				persist
			);
			await fs.mkdir(persistPath, { recursive: true });
			const storageService: Service = {
				name: CACHE_STORAGE_SERVICE_NAME,
				disk: { path: persistPath, writable: true },
			};
			const objectService: Service = {
				name: CACHE_SERVICE_PREFIX,
				worker: {
					compatibilityDate: "2023-07-24",
					compatibilityFlags: ["nodejs_compat", "experimental"],
					modules: [
						{
							name: "cache.worker.js",
							esModule: SCRIPT_CACHE_OBJECT(),
						},
					],
					durableObjectNamespaces: [
						{
							className: CACHE_OBJECT_CLASS_NAME,
							uniqueKey,
						},
					],
					// Store Durable Object SQL databases in persist path
					durableObjectStorage: { localDisk: CACHE_STORAGE_SERVICE_NAME },
					// Bind blob disk directory service to object
					bindings: [
						{
							name: SharedBindings.MAYBE_SERVICE_BLOBS,
							service: { name: CACHE_STORAGE_SERVICE_NAME },
						},
						{
							name: SharedBindings.MAYBE_SERVICE_LOOPBACK,
							service: { name: SERVICE_LOOPBACK },
						},
						...getMiniflareObjectBindings(unsafeStickyBlobs),
					],
				},
			};
			services.push(storageService, objectService);

			// NOTE: not migrating here as applications should be able to recover from
			// cache evictions, and we'd need to locate all named caches
		}

		return services;
	},
	getPersistPath({ cachePersist }, tmpPath) {
		return getPersistPath(CACHE_PLUGIN_NAME, tmpPath, undefined, cachePersist);
	},
};
