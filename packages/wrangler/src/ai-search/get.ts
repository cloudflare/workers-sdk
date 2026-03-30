import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { getInstance } from "./client";

export const aiSearchGetCommand = createCommand({
	metadata: {
		description: "Get details of an AI Search instance",
		status: "open beta",
		owner: "Product: AI Search",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the AI Search instance.",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as clean JSON",
		},
	},
	positionalArgs: ["name"],
	async handler({ name, json }, { config }) {
		const instance = await getInstance(config, name);

		if (json) {
			logger.log(JSON.stringify(instance, null, 2));
			return;
		}

		logger.table([
			{
				name: instance.id,
				type: instance.type,
				status: instance.status ?? "",
				source: instance.source,
				model: instance.ai_search_model ?? "",
				embedding: instance.embedding_model ?? "",
				created: instance.created_at,
				modified: instance.modified_at,
			},
		]);
	},
});
