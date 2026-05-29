import { z } from "zod";
import {
	getUserBindingServiceName,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

const WebSearchEntrySchema = z.object({
	remoteProxyConnectionString: z
		.custom<RemoteProxyConnectionString>()
		.optional(),
});

export const WebSearchOptionsSchema = z.object({
	webSearch: z.record(WebSearchEntrySchema).optional(),
});

export const WEB_SEARCH_PLUGIN_NAME = "web-search";

const WEB_SEARCH_SCOPE = "web-search";

export const WEB_SEARCH_PLUGIN: Plugin<typeof WebSearchOptionsSchema> = {
	options: WebSearchOptionsSchema,
	async getBindings(options) {
		const bindings: {
			name: string;
			service: { name: string };
		}[] = [];

		for (const [bindingName, entry] of Object.entries(
			options.webSearch ?? {}
		)) {
			bindings.push({
				name: bindingName,
				service: {
					name: getUserBindingServiceName(
						WEB_SEARCH_SCOPE,
						bindingName,
						entry.remoteProxyConnectionString
					),
				},
			});
		}

		return bindings;
	},
	getNodeBindings(options: z.infer<typeof WebSearchOptionsSchema>) {
		const nodeBindings: Record<string, ProxyNodeBinding> = {};

		for (const bindingName of Object.keys(options.webSearch ?? {})) {
			nodeBindings[bindingName] = new ProxyNodeBinding();
		}

		return nodeBindings;
	},
	async getServices({ options }) {
		const services: {
			name: string;
			worker: ReturnType<typeof remoteProxyClientWorker>;
		}[] = [];

		for (const [bindingName, entry] of Object.entries(
			options.webSearch ?? {}
		)) {
			services.push({
				name: getUserBindingServiceName(
					WEB_SEARCH_SCOPE,
					bindingName,
					entry.remoteProxyConnectionString
				),
				worker: remoteProxyClientWorker(
					entry.remoteProxyConnectionString,
					bindingName
				),
			});
		}

		return services;
	},
};
