import SCRIPT_RATELIMIT_OBJECT from "worker:ratelimit/ratelimit";
import * as z from "zod/v4";
import { Worker_Binding } from "../../runtime";
import { Plugin, ProxyNodeBinding } from "../shared";

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
	ratelimits: z.record(z.string(), RatelimitConfigSchema).optional(),
});

export const RATELIMIT_PLUGIN_NAME = "ratelimit";
const SERVICE_RATELIMIT_PREFIX = `${RATELIMIT_PLUGIN_NAME}`;
const SERVICE_RATELIMIT_MODULE = `cloudflare-internal:${SERVICE_RATELIMIT_PREFIX}:module`;

function buildJsonBindings(bindings: Record<string, any>): Worker_Binding[] {
	return Object.entries(bindings).map(([name, value]) => ({
		name,
		json: JSON.stringify(value),
	}));
}

export const RATELIMIT_PLUGIN: Plugin<typeof RatelimitOptionsSchema> = {
	options: RatelimitOptionsSchema,
	getBindings(options: z.infer<typeof RatelimitOptionsSchema>) {
		if (!options.ratelimits) {
			return [];
		}
		const bindings = Object.entries(options.ratelimits).map<Worker_Binding>(
			([name, config]) => ({
				name,
				wrapped: {
					moduleName: SERVICE_RATELIMIT_MODULE,
					innerBindings: buildJsonBindings({
						namespaceId: name,
						limit: config.simple.limit,
						period: config.simple.period,
					}),
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
	async getServices() {
		return [];
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
						esModule: SCRIPT_RATELIMIT_OBJECT(),
						internal: true,
					},
				],
			},
		];
	},
};
