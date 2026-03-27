import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { getNamespace } from "./client";

export const agentMemoryNamespaceGetCommand = createCommand({
	metadata: {
		description: "Get details for a given Agent Memory namespace",
		status: "open beta",
		owner: "Product: Agent Memory",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		namespace_id: {
			type: "string",
			demandOption: true,
			description: "The ID of the namespace to retrieve",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as JSON",
		},
	},
	positionalArgs: ["namespace_id"],
	async handler({ namespace_id, json }, { config }) {
		const ns = await getNamespace(config, namespace_id);

		if (json) {
			logger.json(ns);
			return;
		}

		logger.table([
			{
				namespace_id: ns.id,
				name: ns.name,
				account_id: ns.account_id,
				created_at: ns.created_at,
				updated_at: ns.updated_at,
			},
		]);
	},
});
