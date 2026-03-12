import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { listJobs } from "../client";

export const aiSearchJobsListCommand = createCommand({
	metadata: {
		description: "List indexing jobs for an AI Search instance",
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
		const jobs = await listJobs(config, name);

		if (jobs.length === 0) {
			logger.warn("No indexing jobs found for this instance.");
			return;
		}

		if (json) {
			logger.log(JSON.stringify(jobs, null, 2));
			return;
		}

		logger.table(
			jobs.map((job) => ({
				id: job.id,
				source: job.source,
				status: job.status,
				end_reason: job.end_reason ?? "",
				created: job.created_at,
			}))
		);
	},
});
