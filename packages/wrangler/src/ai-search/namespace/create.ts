import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { createNamespace } from "../client";

export const aiSearchNamespaceCreateCommand = createCommand({
	metadata: {
		description: "Create a new AI Search namespace",
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
			description: "The name of the AI Search namespace to create.",
		},
		description: {
			type: "string",
			description: "Optional description for the namespace (max 256 chars).",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as clean JSON",
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		if (!args.json) {
			logger.log(`Creating AI Search namespace "${args.name}"...`);
		}
		const namespace = await createNamespace(config, accountId, {
			name: args.name,
			...(args.description !== undefined
				? { description: args.description }
				: {}),
		});

		if (args.json) {
			logger.log(JSON.stringify(namespace, null, 2));
			return;
		}

		logger.log(
			`Successfully created AI Search namespace "${namespace.name}"\n` +
				`  Name:        ${namespace.name}\n` +
				`  Description: ${namespace.description ?? ""}\n` +
				`  Created:     ${namespace.created_at}`
		);
	},
});
