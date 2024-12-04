import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";

export const workflowsDeleteCommand = createCommand({
	metadata: {
		description:
			"Delete workflow - when deleting a workflow, it will also delete it's own instances",
		owner: "Product: Workflows",
		status: "open-beta",
		hidden: true,
	},

	args: {
		name: {
			describe: "Name of the workflow",
			type: "string",
			demandOption: true,
		},
	},
	positionalArgs: ["name"],

	async handler(args) {
		logger.info("🚫 delete command not yet implement");
		logger.log(`🚫 Workflow "${args.name}" NOT removed`);
	},
});
