import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import {
	getLocalInstanceIdFromArgs,
	localWorkflowArgs,
	updateLocalInstanceStatus,
} from "../../local";
import {
	getInstanceIdFromArgs,
	jsonWorkflowArgs,
	updateInstanceStatus,
} from "../../utils";

export const workflowsInstancesResumeCommand = createCommand({
	metadata: {
		description: "Resume a workflow instance",
		owner: "Product: Workflows",
		status: "stable",
	},
	positionalArgs: ["name", "id"],
	args: {
		...localWorkflowArgs,
		...jsonWorkflowArgs,
		name: {
			describe: "Name of the workflow",
			type: "string",
			demandOption: true,
		},
		id: {
			describe:
				"ID of the instance - instead of an UUID you can type 'latest' to get the latest instance and resume it",
			type: "string",
			demandOption: true,
		},
	},

	behaviour: {
		printBanner: (args) => !args.json,
	},

	async handler(args, { config }) {
		let id: string;

		if (args.local) {
			id = await getLocalInstanceIdFromArgs(args.port, args, {
				quiet: args.json,
			});
			await updateLocalInstanceStatus(args.port, args.name, id, "resume");
		} else {
			const accountId = await requireAuth(config);
			id = await getInstanceIdFromArgs(accountId, args, config);
			await updateInstanceStatus(config, accountId, args.name, id, "resume");
		}

		if (args.json) {
			logger.json({ name: args.name, id, success: true });
			return;
		}

		logger.info(
			`🔄 The instance "${id}" from ${args.name} was resumed successfully`
		);
	},
});
