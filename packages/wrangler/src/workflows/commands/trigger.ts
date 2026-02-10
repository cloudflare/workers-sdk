import { UserError } from "@cloudflare/workers-utils";
import { fetchResult } from "../../cfetch";
import { createCommand } from "../../core/create-command";
import { requireAuth } from "../../user";
import type { InstanceWithoutDates } from "../types";

export const workflowsTriggerCommand = createCommand({
	metadata: {
		description:
			"Trigger a workflow, creating a new instance. Can optionally take a JSON string to pass a parameter into the workflow instance",
		owner: "Product: Workflows",
		status: "stable",
	},

	args: {
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
		const accountId = await requireAuth(config);

		if (args.params.length != 0) {
			try {
				JSON.parse(args.params);
			} catch (e) {
				throw new UserError(
					`Error while parsing instance parameters: "${args.params}" with ${e}' `
				);
			}
		}

		const response = await fetchResult<InstanceWithoutDates>(
			config,
			`/accounts/${accountId}/workflows/${args.name}/instances`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					instance_id: args.id,
					params: args.params.length != 0 ? JSON.parse(args.params) : undefined,
				}),
			}
		);

		logger.info(
			`🚀 Workflow instance "${response.id}" has been queued successfully`
		);
	},
});
