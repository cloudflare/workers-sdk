import { z } from "zod";
import {
	buildRemoteProxyProps,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

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
const AGENT_MEMORY_REMOTE_SERVICE_NAME = `${AGENT_MEMORY_SCOPE}:remote`;

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
				name: AGENT_MEMORY_REMOTE_SERVICE_NAME,
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
	async getServices({ options }) {
		if (!options.agentMemory || Object.keys(options.agentMemory).length === 0) {
			return [];
		}

		return [
			{
				name: AGENT_MEMORY_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			},
		];
	},
};
