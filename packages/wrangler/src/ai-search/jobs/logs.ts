import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { getJobLogs } from "../client";

export const aiSearchJobsLogsCommand = createCommand({
	metadata: {
		description: "List log entries for an AI Search indexing job",
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
		"job-id": {
			type: "string",
			demandOption: true,
			description: "The ID of the job to get logs for.",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as clean JSON",
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		const logs = await getJobLogs(config, args.name, args.jobId);

		if (logs.length === 0) {
			logger.warn("No log entries found for this job.");
			return;
		}

		if (args.json) {
			logger.log(JSON.stringify(logs, null, 2));
			return;
		}

		logger.table(
			logs.map((entry) => ({
				timestamp: entry.created_at,
				level: entry.level ?? "info",
				message: entry.message,
			}))
		);
	},
});
