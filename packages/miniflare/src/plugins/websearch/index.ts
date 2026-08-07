import { z } from "zod";
import { SERVICE_REMOTE_BINDINGS } from "../core";
import { buildRemoteProxyProps, ProxyNodeBinding } from "../shared";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

const WebsearchEntrySchema = z.object({
	remoteProxyConnectionString: z
		.custom<RemoteProxyConnectionString>()
		.optional(),
});

export const WebsearchOptionsSchema = z.object({
	websearch: z.record(z.string(), WebsearchEntrySchema).optional(),
});

export const WEBSEARCH_PLUGIN_NAME = "websearch";

export const WEBSEARCH_PLUGIN: Plugin<typeof WebsearchOptionsSchema> = {
	options: WebsearchOptionsSchema,
	bindingTypeDescription: "Web Search",
	async getBindings(options) {
		const bindings: {
			name: string;
			service: { name: string; props?: { json: string } };
		}[] = [];

		for (const [bindingName, entry] of Object.entries(
			options.websearch ?? {}
		)) {
			bindings.push({
				name: bindingName,
				service: {
					name: SERVICE_REMOTE_BINDINGS,
					props: buildRemoteProxyProps(
						entry.remoteProxyConnectionString,
						bindingName
					),
				},
			});
		}

		return bindings;
	},
	getNodeBindings(options: z.infer<typeof WebsearchOptionsSchema>) {
		const nodeBindings: Record<string, ProxyNodeBinding> = {};

		for (const bindingName of Object.keys(options.websearch ?? {})) {
			nodeBindings[bindingName] = new ProxyNodeBinding();
		}

		return nodeBindings;
	},
	async getServices() {
		return [];
	},
};
