import assert from "node:assert";
import LOCAL_DISPATCH_NAMESPACE from "worker:dispatch-namespace/dispatch-namespace";
import { z } from "zod";
import { Worker_Binding } from "../../runtime";
import {
	hybridClientWorker,
	HybridConnectionString,
	Plugin,
	ProxyNodeBinding,
} from "../shared";

export const DispatchNamespaceOptionsSchema = z.object({
	dispatchNamespaces: z
		.record(
			z.object({
				namespace: z.string(),
				hybridConnectionString: z.custom<HybridConnectionString>(),
			})
		)
		.optional(),
});

export const DISPATCH_NAMESPACE_PLUGIN_NAME = "dispatch-namespace";

export const DISPATCH_NAMESPACE_PLUGIN: Plugin<
	typeof DispatchNamespaceOptionsSchema
> = {
	options: DispatchNamespaceOptionsSchema,
	async getBindings(options) {
		if (!options.dispatchNamespaces) {
			return [];
		}

		const bindings = Object.entries(
			options.dispatchNamespaces
		).map<Worker_Binding>(([name, config]) => {
			return {
				name,
				wrapped: {
					moduleName: `${DISPATCH_NAMESPACE_PLUGIN_NAME}:local-dispatch-namespace`,
					innerBindings: [
						{
							name: "fetcher",
							service: {
								name: `${DISPATCH_NAMESPACE_PLUGIN_NAME}:ns:${config.namespace}`,
							},
						},
					],
				},
			};
		});
		return bindings;
	},
	getNodeBindings(options: z.infer<typeof DispatchNamespaceOptionsSchema>) {
		if (!options.dispatchNamespaces) {
			return {};
		}
		return Object.fromEntries(
			Object.keys(options.dispatchNamespaces).map((name) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		if (!options.dispatchNamespaces) {
			return [];
		}

		return Object.entries(options.dispatchNamespaces).map(([name, config]) => {
			assert(
				config.hybridConnectionString,
				"Dispatch Namespace bindings only support Mixed Mode"
			);
			return {
				name: `${DISPATCH_NAMESPACE_PLUGIN_NAME}:ns:${config.namespace}`,
				worker: hybridClientWorker(config.hybridConnectionString, name),
			};
		});
	},
	getExtensions({ options }) {
		if (!options.some((o) => o.dispatchNamespaces)) {
			return [];
		}

		return [
			{
				modules: [
					{
						name: `${DISPATCH_NAMESPACE_PLUGIN_NAME}:local-dispatch-namespace`,
						esModule: LOCAL_DISPATCH_NAMESPACE(),
						internal: true,
					},
				],
			},
		];
	},
};
