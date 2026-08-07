import { z } from "zod";
import { SERVICE_REMOTE_BINDINGS } from "../core";
import { buildRemoteProxyProps, ProxyNodeBinding } from "../shared";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

const AISearchEntrySchema = z.object({
	namespace: z.string().optional(),
	instance_name: z.string().optional(),
	remoteProxyConnectionString: z
		.custom<RemoteProxyConnectionString>()
		.optional(),
});

export const AISearchOptionsSchema = z.object({
	aiSearchNamespaces: z.record(z.string(), AISearchEntrySchema).optional(),
	aiSearchInstances: z.record(z.string(), AISearchEntrySchema).optional(),
});

export const AI_SEARCH_PLUGIN_NAME = "ai-search";

export const AI_SEARCH_PLUGIN: Plugin<typeof AISearchOptionsSchema> = {
	options: AISearchOptionsSchema,
	bindingTypeDescription: "AI Search",
	async getBindings(options) {
		const bindings: {
			name: string;
			service: { name: string; props?: { json: string } };
		}[] = [];

		for (const [bindingName, entry] of [
			...Object.entries(options.aiSearchNamespaces ?? {}),
			...Object.entries(options.aiSearchInstances ?? {}),
		]) {
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
	getNodeBindings(options: z.infer<typeof AISearchOptionsSchema>) {
		const nodeBindings: Record<string, ProxyNodeBinding> = {};

		for (const bindingName of Object.keys(options.aiSearchNamespaces ?? {})) {
			nodeBindings[bindingName] = new ProxyNodeBinding();
		}
		for (const bindingName of Object.keys(options.aiSearchInstances ?? {})) {
			nodeBindings[bindingName] = new ProxyNodeBinding();
		}

		return nodeBindings;
	},
	async getServices() {
		return [];
	},
};
