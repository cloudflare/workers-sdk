import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { createJob, DEFAULT_NAMESPACE } from "../client";

export const aiSearchJobsCreateCommand = createCommand({
	metadata: {
		description: "Trigger a new indexing job for an AI Search instance",
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
		description: {
			type: "string",
			description: "Optional description for the indexing job.",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as clean JSON",
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		if (!args.json) {
			logger.log(
				`Triggering indexing job for AI Search instance "${args.name}"...`
			);
		}

		const job = await createJob(config, args.namespace, args.name, {
			...(args.description !== undefined
				? { description: args.description }
				: {}),
		});

		if (args.json) {
			logger.log(JSON.stringify(job, null, 2));
			return;
		}

		logger.log(
			`Successfully created indexing job "${job.id}"\n` +
				`  Source:      ${job.source}\n` +
				`  Description: ${job.description ?? ""}\n` +
				`  Started:     ${job.started_at ?? "-"}`
		);
	},
});
