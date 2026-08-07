import { z } from "zod";
import { SERVICE_REMOTE_BINDINGS } from "../core";
import { buildRemoteProxyProps, ProxyNodeBinding } from "../shared";
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
					name: SERVICE_REMOTE_BINDINGS,
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
		return [];
	},
};
