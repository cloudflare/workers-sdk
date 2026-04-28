import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { getNamespace } from "../client";

export const aiSearchNamespaceGetCommand = createCommand({
	metadata: {
		description: "Get details of an AI Search namespace",
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
			description: "The name of the AI Search namespace.",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as clean JSON",
		},
	},
	positionalArgs: ["name"],
	async handler({ name, json }, { config }) {
		const namespace = await getNamespace(config, name);

		if (json) {
			logger.log(JSON.stringify(namespace, null, 2));
			return;
		}

		logger.table([
			{
				name: namespace.name,
				description: namespace.description ?? "",
				created: namespace.created_at,
			},
		]);
	},
});
