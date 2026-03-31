import { z } from "zod";
import { Worker_Binding } from "../../runtime";
import {
	getUserBindingServiceName,
	Plugin,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	RemoteProxyConnectionString,
} from "../shared";

const FlagshipSchema = z.object({
	app_id: z.string(),
	remoteProxyConnectionString: z
		.custom<RemoteProxyConnectionString>()
		.optional(),
});

export const FlagshipOptionsSchema = z.object({
	flagship: z.record(FlagshipSchema).optional(),
});

export const FLAGSHIP_PLUGIN_NAME = "flagship";

export const FLAGSHIP_PLUGIN: Plugin<typeof FlagshipOptionsSchema> = {
	options: FlagshipOptionsSchema,
	async getBindings(options) {
		if (!options.flagship) {
			return [];
		}

		return Object.entries(options.flagship).map<Worker_Binding>(
			([name, config]) => ({
				name,
				service: {
					name: getUserBindingServiceName(
						FLAGSHIP_PLUGIN_NAME,
						name,
						config.remoteProxyConnectionString
					),
				},
			})
		);
	},
	getNodeBindings(options: z.infer<typeof FlagshipOptionsSchema>) {
		if (!options.flagship) {
			return {};
		}
		return Object.fromEntries(
			Object.keys(options.flagship).map((name) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		if (!options.flagship) {
			return [];
		}

		// Flagship is a remote-only binding — flag evaluation always happens
		// against the deployed Flagship service. When remoteProxyConnectionString
		// is provided (i.e. `wrangler dev --remote`), the proxy client worker
		// forwards requests to the real service. Without it, there is no local
		// simulation available.
		return Object.entries(options.flagship).flatMap(([name, config]) => {
			if (!config.remoteProxyConnectionString) {
				return [];
			}

			return [
				{
					name: getUserBindingServiceName(
						FLAGSHIP_PLUGIN_NAME,
						name,
						config.remoteProxyConnectionString
					),
					worker: remoteProxyClientWorker(
						config.remoteProxyConnectionString,
						name
					),
				},
			];
		});
	},
};
