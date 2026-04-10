import BINDING_SCRIPT from "worker:flagship/binding";
import { z } from "zod";
import {
	getUserBindingServiceName,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Worker_Binding } from "../../runtime";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

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
					entrypoint: "FlagshipBinding",
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

		return Object.entries(options.flagship).map(
			([name, { remoteProxyConnectionString }]) => {
				return {
					name: getUserBindingServiceName(
						FLAGSHIP_PLUGIN_NAME,
						name,
						remoteProxyConnectionString
					),
					worker: remoteProxyConnectionString
						? remoteProxyClientWorker(remoteProxyConnectionString, name)
						: {
								compatibilityDate: "2025-03-17",
								modules: [
									{
										name: "binding.worker.js",
										esModule: BINDING_SCRIPT(),
									},
								],
							},
				};
			}
		);
	},
};
