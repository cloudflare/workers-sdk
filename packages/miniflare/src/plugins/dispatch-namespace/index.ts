import SCRIPT_DISPATCH_NAMESPACE from "worker:dispatch-namespace/dispatch-namespace";
import SCRIPT_DISPATCH_NAMESPACE_PROXY from "worker:dispatch-namespace/dispatch-namespace-proxy";
import {
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getRemoteProxyConnectionString,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Worker_Binding } from "../../runtime";
import type { ParsedWorkerOptions, Plugin } from "../shared";

export const DISPATCH_NAMESPACE_PLUGIN_NAME = "dispatch-namespace";

// One shared proxy client service for all dispatch namespaces (config via props).
const DISPATCH_NAMESPACE_REMOTE_SERVICE_NAME = `${DISPATCH_NAMESPACE_PLUGIN_NAME}-proxy:remote`;

export const DISPATCH_NAMESPACE_PLUGIN: Plugin = {
	bindingTypeDescription: "Dispatch namespace",
	async getBindings(options) {
		return getEnvBindingsOfType(
			options.config,
			"dispatch-namespace"
		).map<Worker_Binding>(([name, binding]) => {
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
									getRemoteProxyConnectionString(binding, options.dev),
									name
								),
							},
						},
					],
				},
			};
		});
	},
	getNodeBindings(options) {
		return Object.fromEntries(
			getEnvBindingsOfType(options.config, "dispatch-namespace").map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		if (
			getEnvBindingsOfType(options.config, "dispatch-namespace").length === 0
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
	getExtensions({ options }: { options: ParsedWorkerOptions[] }) {
		if (
			!options.some(
				(o) => getEnvBindingsOfType(o.config, "dispatch-namespace").length > 0
			)
		) {
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
