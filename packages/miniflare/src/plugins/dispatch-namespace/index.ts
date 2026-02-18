import DISPATCH_NAMESPACE_WORKER from "worker:dispatch-namespace/dispatch-namespace";
import { z } from "zod";
import {
	getUserBindingServiceName,
	Plugin,
	ProxyNodeBinding,
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

export const DISPATCH_NAMESPACE_PLUGIN: Plugin<
	typeof DispatchNamespaceOptionsSchema
> = {
	options: DispatchNamespaceOptionsSchema,
	async getBindings(options) {
		if (!options.dispatchNamespaces) {
			return [];
		}

		// Use service bindings - the worker has a custom .get() that creates
		// local stubs with dispatch options baked in
		return Object.entries(options.dispatchNamespaces).map(([name, config]) => ({
			name,
			service: {
				name: getUserBindingServiceName(
					DISPATCH_NAMESPACE_PLUGIN_NAME,
					name,
					config.remoteProxyConnectionString
				),
			},
		}));
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

		// Use dedicated worker with custom .get() - can't use remoteProxyClientWorker
		// because dispatch namespaces need .get() to return a local stub with
		// dispatch options embedded, not an RPC call to the server
		return Object.entries(options.dispatchNamespaces).map(([name, config]) => ({
			name: getUserBindingServiceName(
				DISPATCH_NAMESPACE_PLUGIN_NAME,
				name,
				config.remoteProxyConnectionString
			),
			worker: {
				compatibilityDate: "2025-01-01",
				modules: [
					{
						name: "index.worker.js",
						esModule: DISPATCH_NAMESPACE_WORKER(),
					},
				],
				bindings: [
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
		}));
	},
};
