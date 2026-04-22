import { APIError, UserError } from "@cloudflare/workers-utils";
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
		namespace_name: {
			type: "string",
			demandOption: true,
			description: "The name of the namespace to retrieve",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as JSON",
		},
	},
	positionalArgs: ["namespace_name"],
	async handler({ namespace_name, json }, { config }) {
		let ns;
		try {
			ns = await getNamespace(config, namespace_name);
		} catch (e) {
			if (e instanceof APIError && e.status === 404) {
				throw new UserError(
					`Agent Memory namespace "${namespace_name}" not found. Use 'wrangler agent-memory namespace list' to see available namespaces.`,
					{ telemetryMessage: "Agent Memory namespace not found" }
				);
			}
			throw e;
		}

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
