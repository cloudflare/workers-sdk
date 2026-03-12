import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { getJob } from "../client";

export const aiSearchJobsGetCommand = createCommand({
	metadata: {
		description: "Get details of a specific AI Search indexing job",
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
			description: "The ID of the job to retrieve.",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as clean JSON",
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		const job = await getJob(config, args.name, args.jobId);

		if (args.json) {
			logger.log(JSON.stringify(job, null, 2));
			return;
		}

		logger.table([
			{
				id: job.id,
				source: job.source,
				status: job.status,
				end_reason: job.end_reason ?? "",
				created: job.created_at,
				modified: job.modified_at,
			},
		]);
	},
});
