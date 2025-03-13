import EMAIL_MESSAGE from "worker:email/email";
import { z } from "zod";
import { Worker_Binding } from "../../runtime";
import { Plugin } from "../shared";

// const RatelimitConfigSchema = z.object({
// 	simple: z.object({
// 		limit: z.number().gt(0),

// 		// may relax this to be any number in the future
// 		period: z.nativeEnum(PeriodType).optional(),
// 	}),
// });
// export const OptionsSchema = z.object({
// 	email: z.unknown().optional(),
// });

export const EMAIL_PLUGIN_NAME = "email";
// const SERVICE_RATELIMIT_PREFIX = `${RATELIMIT_PLUGIN_NAME}`;
// const SERVICE_RATELIMIT_MODULE = `cloudflare-internal:${SERVICE_RATELIMIT_PREFIX}:module`;

function buildJsonBindings(bindings: Record<string, any>): Worker_Binding[] {
	return Object.entries(bindings).map(([name, value]) => ({
		name,
		json: JSON.stringify(value),
	}));
}

function createPlugin<O extends z.ZodType, S extends z.ZodType | undefined>(
	pluginDefinition: Plugin<O, S>
): Plugin<O, S> {
	return pluginDefinition;
}

export const EMAIL_PLUGIN = createPlugin({
	options: z.object({
		email: z.unknown().optional(),
	}),
	getBindings(options) {
		// if (!options.ratelimits) {
		// 	return [];
		// }
		// const bindings = Object.entries(options.ratelimits).map<Worker_Binding>(
		// 	([name, config]) => ({
		// 		name,
		// 		wrapped: {
		// 			moduleName: SERVICE_RATELIMIT_MODULE,
		// 			innerBindings: buildJsonBindings({
		// 				namespaceId: name,
		// 				limit: config.simple.limit,
		// 				period: config.simple.period,
		// 			}),
		// 		},
		// 	})
		// );
		// return bindings;
		return [];
	},
	getNodeBindings(_options) {
		return {};
		// if (!options.ratelimits) {
		// 	return {};
		// }
		// return Object.fromEntries(
		// 	Object.keys(options.ratelimits).map((name) => [
		// 		name,
		// 		new ProxyNodeBinding(),
		// 	])
		// );
	},
	async getServices(args) {
		// if (!args.options.email) {
		// 	return [];
		// }

		return {
			services: [],
			extensions:
				// The `cloudflare-internal:email` module is shared and can only be added once.
				// As such, only add it on the first Worker
				args.workerIndex === 0
					? [
							{
								modules: [
									{
										name: "cloudflare-internal:email",
										esModule: EMAIL_MESSAGE(),
										internal: true,
									},
								],
							},
						]
					: [],
		};
	},
});
