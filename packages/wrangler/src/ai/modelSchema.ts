import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { requireAuth } from "../user";

export const aiModelsSchemaCommand = createCommand({
	metadata: {
		description: "Get model schema",
		status: "stable",
		owner: "Product: AI",
	},
	behaviour: {
		printBanner: false,
	},
	args: {
		model: {
			type: "string",
			demandOption: true,
			description: "The model to fetch a schema for",
		},
	},
	positionalArgs: ["model"],
	async handler({ model }, { config, sdk }) {
		const accountId = await requireAuth(config);
		const schema = await sdk.ai.models.schema.get({
			account_id: accountId,
			model,
		});

		logger.json(schema);
	},
});
