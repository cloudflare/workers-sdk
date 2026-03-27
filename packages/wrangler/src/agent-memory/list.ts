import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { listNamespaces } from "./client";

export const agentMemoryNamespaceListCommand = createCommand({
	metadata: {
		description:
			"List all Agent Memory namespaces associated with your account",
		status: "open beta",
		owner: "Product: Agent Memory",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		json: {
			type: "boolean",
			default: false,
			description: "Return output as JSON",
		},
	},
	async handler({ json }, { config }) {
		if (!json) {
			logger.log(`📋 Listing Agent Memory namespaces...`);
		}
		const namespaces = await listNamespaces(config);

		if (json) {
			logger.json(namespaces);
			return;
		}

		if (namespaces.length === 0) {
			logger.log(
				`No Agent Memory namespaces found. Use 'wrangler agent-memory namespace create <name>' to create one.`
			);
			return;
		}

		logger.table(
			namespaces.map((ns) => ({
				namespace_id: ns.id,
				name: ns.name,
				created_at: ns.created_at,
			}))
		);
	},
});
