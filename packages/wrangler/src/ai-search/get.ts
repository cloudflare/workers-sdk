import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { DEFAULT_NAMESPACE, getInstance } from "./client";

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
		namespace: {
			type: "string",
			alias: "n",
			default: DEFAULT_NAMESPACE,
			description: "The namespace the instance belongs to.",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as clean JSON",
		},
	},
	positionalArgs: ["name"],
	async handler({ name, namespace, json }, { config }) {
		const instance = await getInstance(config, namespace, name);

		if (json) {
			logger.log(JSON.stringify(instance, null, 2));
			return;
		}

		logger.table([
			{
				name: instance.id,
				namespace: instance.namespace ?? namespace,
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
