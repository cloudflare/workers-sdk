import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { createJob } from "../client";

export const aiSearchJobsCreateCommand = createCommand({
	metadata: {
		description: "Trigger a new indexing job for an AI Search instance",
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
		logger.log(`Triggering indexing job for "${name}"...`);
		const job = await createJob(config, name);

		if (json) {
			logger.log(JSON.stringify(job, null, 2));
			return;
		}

		logger.log(
			`Successfully triggered indexing job\n` +
				`  Job ID:  ${job.id}\n` +
				`  Source:  ${job.source}\n` +
				`  Status:  ${job.status}`
		);
	},
});
