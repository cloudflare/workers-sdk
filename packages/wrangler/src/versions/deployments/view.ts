import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../../core/create-command";

export const deploymentsViewCommand = createCommand({
	metadata: {
		description: "View a deployment of a Worker",
		owner: "Workers: Authoring and Testing",
		status: "stable",
		hidden: true,
	},
	args: {
		name: {
			describe: "Name of the Worker",
			type: "string",
			requiresArg: true,
		},
		["deployment-id"]: {
			describe:
				"Deprecated. Deployment ID is now referred to as Version ID. Please use `wrangler versions view [version-id]` instead.",
			type: "string",
			requiresArg: true,
		},
	},
	positionalArgs: ["deployment-id"],
	handler: async function versionsDeploymentsViewHandler(args) {
		if (args.deploymentId === undefined) {
			throw new UserError(
				"`wrangler deployments view` has been renamed `wrangler deployments status`. Please use that command instead."
			);
		} else {
			throw new UserError(
				"`wrangler deployments view <deployment-id>` has been renamed `wrangler versions view [version-id]`. Please use that command instead."
			);
		}
	},
});
