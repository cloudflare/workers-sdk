import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { createNamespace } from "./client";

export const agentMemoryNamespaceCreateCommand = createCommand({
	metadata: {
		description: "Create a new Agent Memory namespace",
		status: "open beta",
		owner: "Product: Agent Memory",
	},
	args: {
		namespace: {
			type: "string",
			demandOption: true,
			description:
				"The name for the new namespace (max 512 characters, no control characters)",
		},
	},
	positionalArgs: ["namespace"],
	async handler({ namespace }, { config }) {
		const result = await createNamespace(config, namespace);
		logger.log(`✅ Created Agent Memory namespace`);
		logger.log(`  ID:   ${result.id}`);
		logger.log(`  Name: ${result.name}`);
	},
});
