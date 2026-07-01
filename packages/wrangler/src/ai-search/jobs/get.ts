import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { DEFAULT_NAMESPACE, getJob } from "../client";

export const aiSearchJobsGetCommand = createCommand({
	metadata: {
		description: "Get details of an AI Search indexing job",
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
		"job-id": {
			type: "string",
			demandOption: true,
			description: "The ID of the indexing job.",
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
	positionalArgs: ["name", "job-id"],
	async handler({ name, jobId, namespace, json }, { config }) {
		const job = await getJob(config, namespace, name, jobId);

		if (json) {
			logger.log(JSON.stringify(job, null, 2));
			return;
		}

		logger.table([
			{
				id: job.id,
				source: job.source,
				description: job.description ?? "",
				started: job.started_at ?? "-",
				ended: job.ended_at ?? "-",
				end_reason: job.end_reason ?? "-",
				last_seen: job.last_seen_at ?? "-",
			},
		]);
	},
});
