import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import {
	getLocalInstanceIdFromArgs,
	localWorkflowArgs,
	updateLocalInstanceStatus,
} from "../../local";
import { getInstanceIdFromArgs, updateInstanceStatus } from "../../utils";
import type { WorkflowInstanceRestartFrom } from "../../types";

function getRestartFrom(args: {
	fromStepName?: string;
	fromStepCount?: number;
	fromStepType?: "do" | "sleep" | "waitForEvent";
}): WorkflowInstanceRestartFrom | undefined {
	if (!args.fromStepName) {
		if (args.fromStepCount !== undefined || args.fromStepType !== undefined) {
			throw new UserError(
				"--from-step-name is required when using --from-step-count or --from-step-type",
				{
					telemetryMessage:
						"workflows instances restart missing from step name",
				}
			);
		}

		return undefined;
	}

	if (
		args.fromStepCount !== undefined &&
		(!Number.isInteger(args.fromStepCount) || args.fromStepCount < 1)
	) {
		throw new UserError("--from-step-count must be a positive integer", {
			telemetryMessage: "workflows instances restart invalid from step count",
		});
	}

	return {
		name: args.fromStepName,
		...(args.fromStepCount !== undefined ? { count: args.fromStepCount } : {}),
		...(args.fromStepType !== undefined ? { type: args.fromStepType } : {}),
	};
}

export const workflowsInstancesRestartCommand = createCommand({
	metadata: {
		description: "Restart a workflow instance",
		owner: "Product: Workflows",
		status: "stable",
	},
	positionalArgs: ["name", "id"],
	args: {
		...localWorkflowArgs,
		name: {
			describe: "Name of the workflow",
			type: "string",
			demandOption: true,
		},
		id: {
			describe:
				"ID of the instance - instead of an UUID you can type 'latest' to get the latest instance and describe it",
			type: "string",
			demandOption: true,
		},
		"from-step-name": {
			describe: "Name of the step to restart from",
			type: "string",
			demandOption: false,
		},
		"from-step-count": {
			describe:
				"1-based occurrence of the step name/type to restart from (defaults to 1)",
			type: "number",
			demandOption: false,
		},
		"from-step-type": {
			describe:
				"Step type to restart from, used when the same name is shared across step types (defaults to do)",
			type: "string",
			choices: ["do", "sleep", "waitForEvent"] as const,
			demandOption: false,
		},
	},

	async handler(args, { config }) {
		let id: string;
		const from = getRestartFrom(args);

		if (args.local) {
			id = await getLocalInstanceIdFromArgs(args.port, args);
			await updateLocalInstanceStatus(
				args.port,
				args.name,
				id,
				"restart",
				from
			);
		} else {
			const accountId = await requireAuth(config);
			id = await getInstanceIdFromArgs(accountId, args, config);
			await updateInstanceStatus(
				config,
				accountId,
				args.name,
				id,
				"restart",
				from
			);
		}

		logger.info(
			`🥷 The instance "${id}" from ${args.name} was restarted successfully`
		);
	},
});
