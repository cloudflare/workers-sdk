import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { getItemLogs } from "../client";

export const aiSearchItemsLogsCommand = createCommand({
	metadata: {
		description:
			"List processing log entries for a specific item in an AI Search instance",
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
			description: "The ID of the item to get logs for.",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as clean JSON",
		},
		limit: {
			type: "number",
			default: 50,
			description: "Maximum number of log entries to return (1-100)",
		},
		cursor: {
			type: "string",
			description: "Pagination cursor for fetching subsequent pages",
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		const urlParams = new URLSearchParams();
		urlParams.set("limit", args.limit.toString());
		if (args.cursor !== undefined) {
			urlParams.set("cursor", args.cursor);
		}

		const logs = await getItemLogs(config, args.name, args.itemId, urlParams);

		if (logs.length === 0) {
			logger.warn("No log entries found for this item.");
			return;
		}

		if (args.json) {
			logger.log(JSON.stringify(logs, null, 2));
			return;
		}

		logger.table(
			logs.map((entry) => ({
				timestamp: entry.timestamp,
				action: entry.action,
				message: entry.message ?? "",
				error: entry.errorType ?? "",
			}))
		);
	},
});
