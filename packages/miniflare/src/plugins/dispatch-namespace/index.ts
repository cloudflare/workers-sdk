import LOCAL_DISPATCH_NAMESPACE from "worker:dispatch-namespace/dispatch-namespace";
import * as z from "zod/v4";
import { Worker_Binding } from "../../runtime";
import {
	Plugin,
	ProxyNodeBinding,
	RemoteProxyConnectionString,
} from "../shared";

export const DispatchNamespaceOptionsSchema = z.object({
	dispatchNamespaces: z
		.record(
			z.string(),
			z.object({
				namespace: z.string(),
				remoteProxyConnectionString: z
					.custom<RemoteProxyConnectionString>()
					.optional(),
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
						...(config.remoteProxyConnectionString?.href
							? [
									{
										name: "remoteProxyConnectionString",
										text: config.remoteProxyConnectionString.href,
									},
								]
							: []),
						{
							name: "binding",
							text: name,
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
	async getServices() {
		return [];
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
