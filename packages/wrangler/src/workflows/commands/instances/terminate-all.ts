import { CommandLineArgsError } from "@cloudflare/workers-utils";
import { fetchResult } from "../../../cfetch";
import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";

export const workflowsInstancesTerminateAllCommand = createCommand({
	metadata: {
		description: "Terminate all workflow instances",
		owner: "Product: Workflows",
		status: "stable",
		hidden: true,
	},

	positionalArgs: ["name"],

	args: {
		name: {
			describe: "Name of the workflow",
			type: "string",
			demandOption: true,
		},
		status: {
			describe: "Filter instances to be terminated by status",
			type: "string",
		},
	},
	validateArgs: (args) => {
		const validStatusToTerminate = [
			"queued",
			"running",
			"paused",
			"waitingForPause",
			"waiting",
		];
		if (
			args.status !== undefined &&
			!validStatusToTerminate.includes(args.status)
		) {
			throw new CommandLineArgsError(
				`Provided status "${args.status}" is not valid, it must be one of the following: ${validStatusToTerminate.join(", ")}.`
			);
		}
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		const maybeURLQueryString =
			args.status !== undefined
				? new URLSearchParams({
						status: args.status,
					})
				: undefined;

		const result = await fetchResult<{ status: "ok" | "already_running" }>(
			config,
			`/accounts/${accountId}/workflows/${args.name}/instances/terminate`,
			{
				method: "PUT",
			},
			maybeURLQueryString
		);

		if (result.status === "ok") {
			logger.info(
				`🥷 A job to terminate instances from Workflow "${args.name}" ${args.status !== undefined ? `with status "${args.status}"` : ""} has been started. It might take a few minutes to complete.`
			);
			return;
		}

		logger.info(
			`🥷 A job to terminate instances from Workflow "${args.name}" ${args.status !== undefined ? `with status "${args.status}"` : ""} is already running. It might take a few minutes to complete.`
		);
	},
});
