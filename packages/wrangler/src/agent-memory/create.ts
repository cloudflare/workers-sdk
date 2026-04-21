import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { createNamespace } from "./client";

export const agentMemoryNamespaceCreateCommand = createCommand({
	metadata: {
		description: "Create a new Agent Memory namespace",
		status: "open beta",
		owner: "Product: Agent Memory",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		namespace: {
			type: "string",
			demandOption: true,
			description:
				"The name for the new namespace (max 32 characters, alphanumeric with embedded hyphens)",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as JSON",
		},
	},
	positionalArgs: ["namespace"],
	async handler({ namespace, json }, { config }) {
		const result = await createNamespace(config, namespace);

		if (json) {
			logger.json(result);
			return;
		}

		logger.log(`✅ Created Agent Memory namespace "${result.name}"`);
		logger.table([
			{
				namespace_id: result.id,
				name: result.name,
				account_id: result.account_id,
				created_at: result.created_at,
			},
		]);
	},
});
