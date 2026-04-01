import { z } from "zod";
import {
	getUserBindingServiceName,
	Plugin,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	RemoteProxyConnectionString,
} from "../shared";

const AgentMemoryEntrySchema = z.object({
	namespace: z.string(),
	remoteProxyConnectionString: z
		.custom<RemoteProxyConnectionString>()
		.optional(),
});

export const AgentMemoryOptionsSchema = z.object({
	agentMemory: z.record(AgentMemoryEntrySchema).optional(),
});

export const AGENT_MEMORY_PLUGIN_NAME = "agent-memory";

const AGENT_MEMORY_SCOPE = "agent-memory";

export const AGENT_MEMORY_PLUGIN: Plugin<typeof AgentMemoryOptionsSchema> = {
	options: AgentMemoryOptionsSchema,
	async getBindings(options) {
		if (!options.agentMemory) {
			return [];
		}

		return Object.entries(options.agentMemory).map(([bindingName, entry]) => ({
			name: bindingName,
			service: {
				name: getUserBindingServiceName(
					AGENT_MEMORY_SCOPE,
					bindingName,
					entry.remoteProxyConnectionString
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
	async getServices({ options }) {
		if (!options.agentMemory) {
			return [];
		}

		return Object.entries(options.agentMemory).map(([bindingName, entry]) => ({
			name: getUserBindingServiceName(
				AGENT_MEMORY_SCOPE,
				bindingName,
				entry.remoteProxyConnectionString
			),
			worker: remoteProxyClientWorker(
				entry.remoteProxyConnectionString,
				bindingName
			),
		}));
	},
};
