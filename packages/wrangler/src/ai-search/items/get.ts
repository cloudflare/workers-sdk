import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { getItem } from "../client";

export const aiSearchItemsGetCommand = createCommand({
	metadata: {
		description: "Get a specific indexed item from an AI Search instance",
		status: "open beta",
		owner: "Product: AI",
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
		"item-id": {
			type: "string",
			demandOption: true,
			description: "The ID of the item to retrieve.",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as clean JSON",
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		const item = await getItem(config, args.name, args.itemId);

		if (args.json) {
			logger.log(JSON.stringify(item, null, 2));
			return;
		}

		logger.table([
			{
				id: item.id,
				key: item.key,
				status: item.status,
				chunks: String(item.chunks_count),
				checksum: item.checksum,
				size: String(item.size),
				type: item.type,
				created: item.created_at,
				modified: item.modified_at,
			},
		]);
	},
});
