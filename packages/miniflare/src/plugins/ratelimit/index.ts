import SCRIPT_RATELIMIT_CLIENT from "worker:ratelimit/ratelimit";
import SCRIPT_RATELIMIT_OBJECT from "worker:ratelimit/ratelimit-object";
import { z } from "zod";
import { kVoid } from "../../runtime";
import { SharedBindings } from "../../workers";
import {
	getMiniflareObjectBindings,
	getUserBindingServiceName,
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
	simple: z.object({
		limit: z.number().gt(0),

		// may relax this to be any number in the future
		period: z.nativeEnum(PeriodType).optional(),
	}),
});
export const RatelimitOptionsSchema = z.object({
	ratelimits: z.record(RatelimitConfigSchema).optional(),
});

export const RATELIMIT_PLUGIN_NAME = "ratelimit";
const SERVICE_RATELIMIT_PREFIX = `${RATELIMIT_PLUGIN_NAME}`;
const SERVICE_RATELIMIT_MODULE = `cloudflare-internal:${SERVICE_RATELIMIT_PREFIX}:module`;
const RATELIMIT_ENTRY_SERVICE_PREFIX = `${RATELIMIT_PLUGIN_NAME}:ns`;
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
								name: getUserBindingServiceName(
									RATELIMIT_ENTRY_SERVICE_PREFIX,
									name
								),
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
	async getServices({ options, unsafeStickyBlobs }) {
		if (!options.ratelimits) {
			return [];
		}
		const names = Object.keys(options.ratelimits);
		const services = names.map<Service>((name) => ({
			name: getUserBindingServiceName(RATELIMIT_ENTRY_SERVICE_PREFIX, name),
			worker: objectEntryWorker(RATELIMIT_OBJECT, name),
		}));

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
					{ className: RATELIMIT_OBJECT_CLASS_NAME, uniqueKey },
				],
				// Counters are only ever needed for the lifetime of the Miniflare
				// process, never persisted across restarts (matching the previous
				// purely in-memory implementation).
				durableObjectStorage: { inMemory: kVoid },
				bindings: [
					{
						name: SharedBindings.MAYBE_SERVICE_LOOPBACK,
						service: { name: SERVICE_LOOPBACK },
					},
					...getMiniflareObjectBindings(unsafeStickyBlobs),
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
