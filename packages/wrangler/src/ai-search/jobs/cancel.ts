import { createCommand } from "../../core/create-command";
import { confirm } from "../../dialogs";
import { logger } from "../../logger";
import { cancelJob, DEFAULT_NAMESPACE } from "../client";

export const aiSearchJobsCancelCommand = createCommand({
	metadata: {
		description: "Cancel an in-progress AI Search indexing job",
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
			description: "The ID of the indexing job to cancel.",
		},
		namespace: {
			type: "string",
			alias: "n",
			default: DEFAULT_NAMESPACE,
			description: "The namespace the instance belongs to.",
		},
		force: {
			type: "boolean",
			alias: "y",
			default: false,
			description: "Skip confirmation",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as JSON",
		},
	},
	positionalArgs: ["name", "job-id"],
	async handler({ name, jobId, namespace, force, json }, { config }) {
		if (!force) {
			const confirmedCancellation = await confirm(
				`OK to cancel the indexing job "${jobId}" on AI Search instance "${name}"?`
			);
			if (!confirmedCancellation) {
				if (!json) {
					logger.log("Cancellation aborted.");
				}
				return;
			}
		}

		if (!json) {
			logger.log(`Cancelling indexing job "${jobId}"...`);
		}

		const job = await cancelJob(config, namespace, name, jobId);

		if (json) {
			logger.log(JSON.stringify(job, null, 2));
			return;
		}

		logger.log(`Successfully cancelled indexing job "${jobId}"`);
	},
});
