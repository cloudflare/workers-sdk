import { z } from "zod";
import {
	buildRemoteProxyProps,
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
	flagship: z.record(z.string(), FlagshipSchema).optional(),
});

export const FLAGSHIP_PLUGIN_NAME = "flagship";
const FLAGSHIP_REMOTE_SERVICE_NAME = `${FLAGSHIP_PLUGIN_NAME}:remote`;

export const FLAGSHIP_PLUGIN: Plugin<typeof FlagshipOptionsSchema> = {
	options: FlagshipOptionsSchema,
	bindingTypeDescription: "Flagship",
	async getBindings(options) {
		if (!options.flagship) {
			return [];
		}

		return Object.entries(options.flagship).map<Worker_Binding>(
			([name, config]) => ({
				name,
				service: {
					name: FLAGSHIP_REMOTE_SERVICE_NAME,
					props: buildRemoteProxyProps(
						config.remoteProxyConnectionString,
						name
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
		if (!options.flagship || Object.keys(options.flagship).length === 0) {
			return [];
		}

		return [
			{
				name: FLAGSHIP_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			},
		];
	},
};
