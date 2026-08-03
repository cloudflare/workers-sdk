import SCRIPT_DISPATCH_NAMESPACE from "worker:dispatch-namespace/dispatch-namespace";
import SCRIPT_DISPATCH_NAMESPACE_PROXY from "worker:dispatch-namespace/dispatch-namespace-proxy";
import { z } from "zod";
import {
	buildRemoteProxyProps,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Worker_Binding } from "../../runtime";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

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

// One shared proxy client service for all dispatch namespaces (config via props).
const DISPATCH_NAMESPACE_REMOTE_SERVICE_NAME = `${DISPATCH_NAMESPACE_PLUGIN_NAME}-proxy:remote`;

export const DISPATCH_NAMESPACE_PLUGIN: Plugin<
	typeof DispatchNamespaceOptionsSchema
> = {
	options: DispatchNamespaceOptionsSchema,
	bindingTypeDescription: "Dispatch namespace",
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
								name: DISPATCH_NAMESPACE_REMOTE_SERVICE_NAME,
								props: buildRemoteProxyProps(
									config.remoteProxyConnectionString,
									name
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
		if (
			!options.dispatchNamespaces ||
			Object.keys(options.dispatchNamespaces).length === 0
		) {
			return [];
		}

		return [
			{
				name: DISPATCH_NAMESPACE_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(SCRIPT_DISPATCH_NAMESPACE_PROXY),
			},
		];
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
