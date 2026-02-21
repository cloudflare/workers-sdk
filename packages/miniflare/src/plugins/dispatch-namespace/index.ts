import SCRIPT_DISPATCH_NAMESPACE from "worker:dispatch-namespace/dispatch-namespace";
import SCRIPT_DISPATCH_NAMESPACE_PROXY from "worker:dispatch-namespace/dispatch-namespace-proxy";
import { z } from "zod";
import { Worker_Binding } from "../../runtime";
import {
	getUserBindingServiceName,
	Plugin,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	RemoteProxyConnectionString,
} from "../shared";

export const DispatchNamespaceOptionsSchema = z.object({
	dispatchNamespaces: z
		.record(
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

/** Service name for the proxy client worker backing a dispatch namespace. */
function getProxyServiceName(
	name: string,
	remoteProxyConnectionString?: RemoteProxyConnectionString
): string {
	return getUserBindingServiceName(
		`${DISPATCH_NAMESPACE_PLUGIN_NAME}-proxy`,
		name,
		remoteProxyConnectionString
	);
}

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
							name: "proxyClient",
							service: {
								name: getProxyServiceName(
									name,
									config.remoteProxyConnectionString
								),
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

		return Object.entries(options.dispatchNamespaces).map(([name, config]) => ({
			name: getProxyServiceName(name, config.remoteProxyConnectionString),
			worker: remoteProxyClientWorker(
				config.remoteProxyConnectionString,
				name,
				undefined,
				SCRIPT_DISPATCH_NAMESPACE_PROXY
			),
		}));
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
						esModule: SCRIPT_DISPATCH_NAMESPACE(),
						internal: true,
					},
				],
			},
		];
	},
};
