import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { DEFAULT_NAMESPACE, getInstanceStats } from "./client";

export const aiSearchStatsCommand = createCommand({
	metadata: {
		description: "Get usage statistics for an AI Search instance",
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
		const stats = await getInstanceStats(config, namespace, name);

		if (json) {
			logger.log(JSON.stringify(stats, null, 2));
			return;
		}

		logger.table([
			{
				Queued: String(stats.queued),
				Processing: String(stats.running),
				Indexed: String(stats.completed),
				Skipped: String(stats.skipped),
				Outdated: String(stats.outdated),
				Errors: String(stats.error),
			},
		]);
	},
});
