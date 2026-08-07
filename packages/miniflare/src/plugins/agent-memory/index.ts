import { z } from "zod";
import { SERVICE_REMOTE_BINDINGS } from "../core";
import { buildRemoteProxyProps, ProxyNodeBinding } from "../shared";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

const AgentMemoryEntrySchema = z.object({
	namespace: z.string(),
	remoteProxyConnectionString: z
		.custom<RemoteProxyConnectionString>()
		.optional(),
});

export const AgentMemoryOptionsSchema = z.object({
	agentMemory: z.record(z.string(), AgentMemoryEntrySchema).optional(),
});

export const AGENT_MEMORY_PLUGIN_NAME = "agent-memory";

export const AGENT_MEMORY_PLUGIN: Plugin<typeof AgentMemoryOptionsSchema> = {
	options: AgentMemoryOptionsSchema,
	bindingTypeDescription: "Agent Memory",
	async getBindings(options) {
		if (!options.agentMemory) {
			return [];
		}

		return Object.entries(options.agentMemory).map(([bindingName, entry]) => ({
			name: bindingName,
			service: {
				name: SERVICE_REMOTE_BINDINGS,
				props: buildRemoteProxyProps(
					entry.remoteProxyConnectionString,
					bindingName
				),
			},
		}));
	},
	getNodeBindings(options) {
		if (!options.agentMemory) {
			return {};
		}

		return Object.fromEntries(
			Object.keys(options.agentMemory).map((bindingName) => [
				bindingName,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices() {
		return [];
	},
};
