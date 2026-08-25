import { fetchResult } from "../../cfetch";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { fetchLocalResult, localWorkflowArgs } from "../local";
import { jsonWorkflowArgs } from "../utils";

export const workflowsDeleteCommand = createCommand({
	metadata: {
		description:
			"Delete workflow - when deleting a workflow, it will also delete it's own instances",
		owner: "Product: Workflows",
		status: "stable",
	},
	args: {
		...localWorkflowArgs,
		...jsonWorkflowArgs,
		name: {
			describe: "Name of the workflow",
			type: "string",
			demandOption: true,
		},
	},
	positionalArgs: ["name"],
	behaviour: {
		printBanner: (args) => !args.json,
	},

	async handler(args, { config }) {
		if (args.local) {
			await fetchLocalResult(
				args.port,
				`/workflows/${encodeURIComponent(args.name)}`,
				{ method: "DELETE" }
			);

			if (args.json) {
				logger.json({ name: args.name, success: true });
				return;
			}

			logger.log(
				`✅ Workflow "${args.name}" instances removed successfully from local dev session.`
			);
		} else {
			const accountId = await requireAuth(config);

			await fetchResult(
				config,
				`/accounts/${accountId}/workflows/${args.name}`,
				{ method: "DELETE" }
			);

			if (args.json) {
				logger.json({ name: args.name, success: true });
				return;
			}

			logger.log(
				`✅ Workflow "${args.name}" removed successfully. \n Note that running instances might take a few minutes to be properly terminated.`
			);
		}
	},
});
