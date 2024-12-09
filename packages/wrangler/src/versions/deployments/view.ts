import { UserError } from "../../errors";
import { printWranglerBanner } from "../../wrangler-banner";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../yargs-types";

export type VersionsDeploymentsViewArgs = StrictYargsOptionsToInterface<
	typeof versionsDeploymentsViewOptions
>;

export function versionsDeploymentsViewOptions(yargs: CommonYargsArgv) {
	return yargs
		.option("name", {
			describe: "Name of the worker",
			type: "string",
			requiresArg: true,
		})
		.positional("deployment-id", {
			describe:
				"Deprecated. Deployment ID is now referred to as Version ID. Please use `wrangler versions view [version-id]` instead.",
			type: "string",
			requiresArg: true,
		});
}

export async function versionsDeploymentsViewHandler(
	args: VersionsDeploymentsViewArgs
) {
	await printWranglerBanner();

	if (args.deploymentId === undefined) {
		throw new UserError(
			"`wrangler deployments view` has been renamed `wrangler deployments status`. Please use that command instead."
		);
	} else {
		throw new UserError(
			"`wrangler deployments view <deployment-id>` has been renamed `wrangler versions view [version-id]`. Please use that command instead."
		);
	}
}
