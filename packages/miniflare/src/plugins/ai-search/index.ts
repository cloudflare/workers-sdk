import { z } from "zod";
import {
	getUserBindingServiceName,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

const AISearchEntrySchema = z.object({
	namespace: z.string().optional(),
	instance_name: z.string().optional(),
	remoteProxyConnectionString: z
		.custom<RemoteProxyConnectionString>()
		.optional(),
});

export const AISearchOptionsSchema = z.object({
	aiSearchNamespaces: z.record(AISearchEntrySchema).optional(),
	aiSearchInstances: z.record(AISearchEntrySchema).optional(),
});

export const AI_SEARCH_PLUGIN_NAME = "ai-search";

// Distinct scopes for service name generation to avoid collisions
// between namespace and instance bindings with the same binding name.
const AI_SEARCH_NS_SCOPE = "ai-search-ns";
const AI_SEARCH_INST_SCOPE = "ai-search-inst";

export const AI_SEARCH_PLUGIN: Plugin<typeof AISearchOptionsSchema> = {
	options: AISearchOptionsSchema,
	async getBindings(options) {
		const bindings: {
			name: string;
			service: { name: string };
		}[] = [];

		for (const [bindingName, entry] of Object.entries(
			options.aiSearchNamespaces ?? {}
		)) {
			bindings.push({
				name: bindingName,
				service: {
					name: getUserBindingServiceName(
						AI_SEARCH_NS_SCOPE,
						bindingName,
						entry.remoteProxyConnectionString
					),
				},
			});
		}

		for (const [bindingName, entry] of Object.entries(
			options.aiSearchInstances ?? {}
		)) {
			bindings.push({
				name: bindingName,
				service: {
					name: getUserBindingServiceName(
						AI_SEARCH_INST_SCOPE,
						bindingName,
						entry.remoteProxyConnectionString
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
	async getServices({ options }) {
		const services: {
			name: string;
			worker: ReturnType<typeof remoteProxyClientWorker>;
		}[] = [];

		for (const [bindingName, entry] of Object.entries(
			options.aiSearchNamespaces ?? {}
		)) {
			services.push({
				name: getUserBindingServiceName(
					AI_SEARCH_NS_SCOPE,
					bindingName,
					entry.remoteProxyConnectionString
				),
				worker: remoteProxyClientWorker(
					entry.remoteProxyConnectionString,
					bindingName
				),
			});
		}

		for (const [bindingName, entry] of Object.entries(
			options.aiSearchInstances ?? {}
		)) {
			services.push({
				name: getUserBindingServiceName(
					AI_SEARCH_INST_SCOPE,
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
