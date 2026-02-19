import DISPATCH_NAMESPACE_WORKER from "worker:dispatch-namespace/dispatch-namespace";
import { z } from "zod";
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

		// Uses dedicated worker with custom .get() that returns a local stub
		// with dispatch options embedded (not an RPC call to the server)
		return Object.entries(options.dispatchNamespaces).map(([name, config]) => ({
			name: getUserBindingServiceName(
				DISPATCH_NAMESPACE_PLUGIN_NAME,
				name,
				config.remoteProxyConnectionString
			),
			worker: remoteProxyClientWorker(
				config.remoteProxyConnectionString,
				name,
				undefined,
				DISPATCH_NAMESPACE_WORKER
			),
		}));
	},
};
