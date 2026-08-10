import { z } from "zod";
import {
	buildRemoteProxyProps,
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
	websearch: z.record(z.string(), WebsearchEntrySchema).optional(),
});

export const WEBSEARCH_PLUGIN_NAME = "websearch";

const WEBSEARCH_SCOPE = "websearch";
const WEBSEARCH_REMOTE_SERVICE_NAME = `${WEBSEARCH_SCOPE}:remote`;

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
					name: WEBSEARCH_REMOTE_SERVICE_NAME,
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
	async getServices({ options }) {
		const services: {
			name: string;
			worker: ReturnType<typeof remoteProxyClientWorker>;
		}[] = [];

		if (Object.keys(options.websearch ?? {}).length > 0) {
			services.push({
				name: WEBSEARCH_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			});
		}

		return services;
	},
};
