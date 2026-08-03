import fs from "node:fs/promises";
import SCRIPT_RATELIMIT_CLIENT from "worker:ratelimit/ratelimit";
import SCRIPT_RATELIMIT_OBJECT from "worker:ratelimit/ratelimit-object";
import { z } from "zod";
import { SharedBindings } from "../../workers";
import {
	buildObjectEntryProps,
	getMiniflareObjectBindings,
	getPersistPath,
	objectEntryWorker,
	ProxyNodeBinding,
	SERVICE_LOOPBACK,
} from "../shared";
import type {
	Service,
	Worker_Binding,
	Worker_Binding_DurableObjectNamespaceDesignator,
} from "../../runtime";
import type { Plugin } from "../shared";

export enum PeriodType {
	TENSECONDS = 10,
	MINUTE = 60,
}

export const RatelimitConfigSchema = z.object({
	// The rate limiter's namespace identity. Counters are keyed by this, not by
	// the binding name, so two bindings (in the same Worker or across Workers in
	// a multiworker session) that reference the same namespace share a limit,
	// while the same binding name pointing at different namespaces stays isolated.
	namespace_id: z.string(),
	simple: z.object({
		limit: z.number().gt(0),

		// may relax this to be any number in the future
		period: z.enum(PeriodType).optional().default(PeriodType.MINUTE),
	}),
});
export const RatelimitOptionsSchema = z.object({
	ratelimits: z.record(z.string(), RatelimitConfigSchema).optional(),
});

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

export const RATELIMIT_PLUGIN: Plugin<typeof RatelimitOptionsSchema> = {
	options: RatelimitOptionsSchema,
	bindingTypeDescription: "Rate Limit",
	getBindings(options: z.infer<typeof RatelimitOptionsSchema>) {
		if (!options.ratelimits) {
			return [];
		}
		const bindings = Object.entries(options.ratelimits).map<Worker_Binding>(
			([name, config]) => ({
				name,
				wrapped: {
					moduleName: SERVICE_RATELIMIT_MODULE,
					innerBindings: [
						{
							name: "fetcher",
							service: {
								name: RATELIMIT_LOCAL_ENTRY_SERVICE_NAME,
								props: buildObjectEntryProps(config.namespace_id),
							},
						},
						...buildJsonBindings({
							limit: config.simple.limit,
							period: config.simple.period,
						}),
					],
				},
			})
		);
		return bindings;
	},
	getNodeBindings(options: z.infer<typeof RatelimitOptionsSchema>) {
		if (!options.ratelimits) {
			return {};
		}
		return Object.fromEntries(
			Object.keys(options.ratelimits).map((name) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options, tmpPath, resourcePersistencePath }) {
		// One shared entry service; each namespace_id is supplied per-binding via
		// props, so a single service serves every rate limiter. Multiple bindings
		// sharing a namespace still collapse to a single counter (same DO name).
		const namespaceIds = new Set(
			Object.values(options.ratelimits ?? {}).map((c) => c.namespace_id)
		);
		// Wrangler passes `ratelimits: {}` rather than omitting it when a Worker
		// has no rate limit bindings, so bail on emptiness rather than presence.
		// Otherwise every `wrangler dev` session would create an unused storage
		// directory in the user's persistence directory.
		if (namespaceIds.size === 0) {
			return [];
		}

		const services: Service[] = [
			{
				name: RATELIMIT_LOCAL_ENTRY_SERVICE_NAME,
				worker: objectEntryWorker(RATELIMIT_OBJECT),
			},
		];

		const persistPath = getPersistPath(
			RATELIMIT_PLUGIN_NAME,
			tmpPath,
			resourcePersistencePath
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
				// (what vitest-pool-workers' `reset()` calls) skips namespaces with
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
	getExtensions({ options }) {
		if (!options.some((o) => o.ratelimits)) {
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
