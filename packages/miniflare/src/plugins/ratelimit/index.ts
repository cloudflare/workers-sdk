import fs from "node:fs/promises";
import SCRIPT_RATELIMIT_CLIENT from "worker:ratelimit/ratelimit";
import SCRIPT_RATELIMIT_OBJECT from "worker:ratelimit/ratelimit-object";
import { SharedBindings } from "../../workers";
import {
	buildObjectEntryProps,
	getEnvBindingsOfType,
	getMiniflareObjectBindings,
	getPersistPath,
	getStorageService,
	objectEntryWorker,
	ProxyNodeBinding,
	SERVICE_LOOPBACK,
} from "../shared";
import type {
	Service,
	Worker_Binding,
	Worker_Binding_DurableObjectNamespaceDesignator,
} from "../../runtime";
import type { ParsedWorkerOptions, Plugin } from "../shared";

export enum PeriodType {
	TENSECONDS = 10,
	MINUTE = 60,
}

export const RATELIMIT_PLUGIN_NAME = "ratelimit";
const SERVICE_RATELIMIT_PREFIX = `${RATELIMIT_PLUGIN_NAME}`;
const SERVICE_RATELIMIT_MODULE = `cloudflare-internal:${SERVICE_RATELIMIT_PREFIX}:module`;
const RATELIMIT_ENTRY_SERVICE_PREFIX = `${RATELIMIT_PLUGIN_NAME}:ns`;
// A single entry service shared by every namespace. Each namespace_id is
// supplied per-binding via `ctx.props`, so one service serves all of them.
const RATELIMIT_LOCAL_ENTRY_SERVICE_NAME = `${RATELIMIT_PLUGIN_NAME}:ns:entry`;
const RATELIMIT_STORAGE_SERVICE_NAME = `${RATELIMIT_PLUGIN_NAME}:storage`;
const RATELIMIT_OBJECT_CLASS_NAME = "RateLimiterObject";
const RATELIMIT_OBJECT: Worker_Binding_DurableObjectNamespaceDesignator = {
	serviceName: RATELIMIT_ENTRY_SERVICE_PREFIX,
	className: RATELIMIT_OBJECT_CLASS_NAME,
};

function buildJsonBindings(bindings: Record<string, any>): Worker_Binding[] {
	return Object.entries(bindings).map(([name, value]) => ({
		name,
		json: JSON.stringify(value),
	}));
}

export const RATELIMIT_PLUGIN: Plugin = {
	bindingTypeDescription: "Rate Limit",
	getBindings(options, sharedOptions) {
		return getEnvBindingsOfType(
			options.config,
			"rate-limit"
		).map<Worker_Binding>(([name, binding]) => ({
			name,
			wrapped: {
				moduleName: SERVICE_RATELIMIT_MODULE,
				innerBindings: [
					{
						name: "fetcher",
						service: getStorageService(
							RATELIMIT_LOCAL_ENTRY_SERVICE_NAME,
							buildObjectEntryProps(binding.namespace),
							sharedOptions
						),
					},
					...buildJsonBindings({
						limit: binding.simple.limit,
						period: binding.simple.period,
					}),
				],
			},
		}));
	},
	getNodeBindings(options) {
		return Object.fromEntries(
			getEnvBindingsOfType(options.config, "rate-limit").map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options, tmpPath, sharedOptions }) {
		const ratelimits = getEnvBindingsOfType(options.config, "rate-limit");
		if (ratelimits.length === 0 && !sharedOptions.unsafeEnableSharedStorage) {
			return [];
		}
		// Each namespace is supplied per-binding via props, so one service serves
		// every rate limiter while shared namespaces still use the same DO name.
		const services: Service[] = [
			{
				name: RATELIMIT_LOCAL_ENTRY_SERVICE_NAME,
				worker: objectEntryWorker(RATELIMIT_OBJECT),
			},
		];

		const persistPath = getPersistPath(
			RATELIMIT_PLUGIN_NAME,
			tmpPath,
			sharedOptions.resourcePersistencePath
		);
		await fs.mkdir(persistPath, { recursive: true });
		services.push({
			name: RATELIMIT_STORAGE_SERVICE_NAME,
			disk: { path: persistPath, writable: true },
		});

		const uniqueKey = `miniflare-${RATELIMIT_OBJECT_CLASS_NAME}`;
		services.push({
			name: RATELIMIT_ENTRY_SERVICE_PREFIX,
			worker: {
				compatibilityDate: "2023-07-24",
				compatibilityFlags: ["nodejs_compat", "experimental"],
				modules: [
					{
						name: "ratelimit-object.worker.js",
						esModule: SCRIPT_RATELIMIT_OBJECT(),
					},
				],
				durableObjectNamespaces: [
					{
						className: RATELIMIT_OBJECT_CLASS_NAME,
						uniqueKey,
						enableSql: true,
					},
				],
				// Counters must outlive the Durable Object itself. `workerd` evicts
				// idle objects after ~10s, which would silently reset every counter
				// mid-window if the state lived on the heap (or in `inMemory` storage,
				// which is backed by a per-actor `ActorCache` and is just as lossy).
				//
				// The namespace deliberately stays evictable: `deleteAllDurableObjects()`
				// (what vitest-plugin's `reset()` calls) skips namespaces with
				// `preventEviction` set, and it is what resets these counters between
				// tests, via `ActorNamespace::deleteAll()` -> `SqliteDatabase::reset()`.
				durableObjectStorage: { localDisk: RATELIMIT_STORAGE_SERVICE_NAME },
				bindings: [
					{
						name: SharedBindings.MAYBE_SERVICE_LOOPBACK,
						service: { name: SERVICE_LOOPBACK },
					},
					...getMiniflareObjectBindings(),
				],
			},
		});

		return services;
	},
	getExtensions({ options }: { options: ParsedWorkerOptions[] }) {
		if (
			!options.some(
				(o) => getEnvBindingsOfType(o.config, "rate-limit").length > 0
			)
		) {
			return [];
		}
		return [
			{
				modules: [
					{
						name: SERVICE_RATELIMIT_MODULE,
						esModule: SCRIPT_RATELIMIT_CLIENT(),
						internal: true,
					},
				],
			},
		];
	},
};
