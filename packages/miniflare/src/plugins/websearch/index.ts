import { z } from "zod";
import {
	getUserBindingServiceName,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

const WebsearchEntrySchema = z.object({
	remoteProxyConnectionString: z
		.custom<RemoteProxyConnectionString>()
		.optional(),
});

export const WebsearchOptionsSchema = z.object({
	websearch: z.record(WebsearchEntrySchema).optional(),
});

export const WEBSEARCH_PLUGIN_NAME = "websearch";

const WEBSEARCH_SCOPE = "websearch";

export const WEBSEARCH_PLUGIN: Plugin<typeof WebsearchOptionsSchema> = {
	options: WebsearchOptionsSchema,
	bindingTypeDescription: "Web Search",
	async getBindings(options) {
		const bindings: {
			name: string;
			service: { name: string };
		}[] = [];

		for (const [bindingName, entry] of Object.entries(
			options.websearch ?? {}
		)) {
			bindings.push({
				name: bindingName,
				service: {
					name: getUserBindingServiceName(
						WEBSEARCH_SCOPE,
						bindingName,
						entry.remoteProxyConnectionString
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
	async getServices({ options }) {
		const services: {
			name: string;
			worker: ReturnType<typeof remoteProxyClientWorker>;
		}[] = [];

		for (const [bindingName, entry] of Object.entries(
			options.websearch ?? {}
		)) {
			services.push({
				name: getUserBindingServiceName(
					WEBSEARCH_SCOPE,
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
