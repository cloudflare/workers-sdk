import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { updateNamespace } from "../client";

export const aiSearchNamespaceUpdateCommand = createCommand({
	metadata: {
		description: "Update an AI Search namespace",
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
			description: "The name of the AI Search namespace to update.",
		},
		description: {
			type: "string",
			description: "Updated description for the namespace (max 256 chars).",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as clean JSON",
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		if (args.description === undefined) {
			throw new UserError(
				"No fields to update. Provide --description to update the namespace."
			);
		}

		if (!args.json) {
			logger.log(`Updating AI Search namespace "${args.name}"...`);
		}
		const namespace = await updateNamespace(config, args.name, {
			description: args.description,
		});

		if (args.json) {
			logger.log(JSON.stringify(namespace, null, 2));
			return;
		}

		logger.log(`Successfully updated AI Search namespace "${namespace.name}"`);
	},
});
