import SCRIPT_RATELIMIT_CLIENT from "worker:ratelimit/ratelimit";
import SCRIPT_RATELIMIT_OBJECT from "worker:ratelimit/ratelimit-object";
import { kVoid } from "../../runtime";
import { SharedBindings } from "../../workers";
import {
	getEnvBindingsOfType,
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
import type { ParsedWorkerOptions, Plugin } from "../shared";

export enum PeriodType {
	TENSECONDS = 10,
	MINUTE = 60,
}

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

export const RATELIMIT_PLUGIN: Plugin = {
	bindingTypeDescription: "Rate Limit",
	getBindings(options) {
		return getEnvBindingsOfType(options.config, "rate-limit").map<Worker_Binding>(
			([name, binding]) => ({
				name,
				wrapped: {
					moduleName: SERVICE_RATELIMIT_MODULE,
					innerBindings: [
						{
							name: "fetcher",
							service: {
								name: getUserBindingServiceName(
									RATELIMIT_ENTRY_SERVICE_PREFIX,
									binding.namespace
								),
							},
						},
						...buildJsonBindings({
							limit: binding.simple.limit,
							period: binding.simple.period,
						}),
					],
				},
			})
		);
	},
	getNodeBindings(options) {
		return Object.fromEntries(
			getEnvBindingsOfType(options.config, "rate-limit").map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		const ratelimits = getEnvBindingsOfType(options.config, "rate-limit");
		if (ratelimits.length === 0) {
			return [];
		}
		// One entry service + Durable Object instance per unique namespace.
		// Multiple bindings sharing a namespace collapse to a single counter.
		const services: Service[] = [];
		const seenNamespaces = new Set<string>();
		for (const [, binding] of ratelimits) {
			if (seenNamespaces.has(binding.namespace)) {
				continue;
			}
			seenNamespaces.add(binding.namespace);
			services.push({
				name: getUserBindingServiceName(
					RATELIMIT_ENTRY_SERVICE_PREFIX,
					binding.namespace
				),
				worker: objectEntryWorker(RATELIMIT_OBJECT, binding.namespace),
			});
		}

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
