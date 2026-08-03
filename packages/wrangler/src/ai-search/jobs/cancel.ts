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
	},
	positionalArgs: ["name", "job-id"],
	async handler({ name, jobId, namespace, force }, { config }) {
		if (!force) {
			const confirmedCancellation = await confirm(
				`OK to cancel the indexing job "${jobId}" on AI Search instance "${name}"?`
			);
			if (!confirmedCancellation) {
				logger.log("Cancellation aborted.");
				return;
			}
		}

		logger.log(`Cancelling indexing job "${jobId}"...`);
		await cancelJob(config, namespace, name, jobId);
		logger.log(`Successfully cancelled indexing job "${jobId}"`);
	},
});
