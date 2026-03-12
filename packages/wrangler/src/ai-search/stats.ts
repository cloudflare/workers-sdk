import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { getInstanceStats } from "./client";

export const aiSearchStatsCommand = createCommand({
	metadata: {
		description: "Get usage statistics for an AI Search instance",
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
		json: {
			type: "boolean",
			default: false,
			description: "Return output as clean JSON",
		},
	},
	positionalArgs: ["name"],
	async handler({ name, json }, { config }) {
		const stats = await getInstanceStats(config, name);

		if (json) {
			logger.log(JSON.stringify(stats, null, 2));
			return;
		}

		logger.table([
			{
				completed: String(stats.completed),
				error: String(stats.error),
				file_embed_errors: String(stats.file_embed_errors),
				in_progress: String(stats.in_progress),
				pending: String(stats.pending),
				total: String(stats.total),
			},
		]);
	},
});
