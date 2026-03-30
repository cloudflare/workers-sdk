import { UserError } from "@cloudflare/workers-utils";
import { fetchResult } from "../../cfetch";
import { createCommand } from "../../core/create-command";
import { requireAuth } from "../../user";
import { fetchLocalResult, localWorkflowArgs } from "../local";
import type { InstanceWithoutDates } from "../types";

export const workflowsTriggerCommand = createCommand({
	metadata: {
		description:
			"Trigger a workflow, creating a new instance. Can optionally take a JSON string to pass a parameter into the workflow instance",
		owner: "Product: Workflows",
		status: "stable",
	},
	args: {
		...localWorkflowArgs,
		name: {
			describe: "Name of the workflow",
			type: "string",
			demandOption: true,
		},
		params: {
			describe: "Params for the workflow instance, encoded as a JSON string",
			type: "string",
			default: "",
		},
		id: {
			describe:
				"Custom instance ID, if not provided it will default to a random UUIDv4",
			type: "string",
			default: undefined,
		},
	},
	positionalArgs: ["name", "params"],

	async handler(args, { config, logger }) {
		if (args.params.length != 0) {
			try {
				JSON.parse(args.params);
			} catch (e) {
				throw new UserError(
					`Error while parsing instance parameters: "${args.params}" with ${e}' `
				);
			}
		}

		const parsedParams =
			args.params.length != 0 ? JSON.parse(args.params) : undefined;

		let instanceId: string;

		if (args.local) {
			const response = await fetchLocalResult<{ id: string }>(
				args.port,
				`/workflows/${encodeURIComponent(args.name)}/instances`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						id: args.id,
						params: parsedParams,
					}),
				}
			);
			instanceId = response.id;

			logger.info(
				`🚀 Workflow instance "${instanceId}" has been triggered successfully`
			);
		} else {
			const accountId = await requireAuth(config);

			const response = await fetchResult<InstanceWithoutDates>(
				config,
				`/accounts/${accountId}/workflows/${args.name}/instances`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						instance_id: args.id,
						params: parsedParams,
					}),
				}
			);
			instanceId = response.id;

			logger.info(
				`🚀 Workflow instance "${instanceId}" has been queued successfully`
			);
		}
	},
});
