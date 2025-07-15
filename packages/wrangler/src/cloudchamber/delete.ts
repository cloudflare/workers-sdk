import { cancel, endSection, startSection } from "@cloudflare/cli";
import { inputPrompt } from "@cloudflare/cli/interactive";
import { DeploymentsService } from "@cloudflare/containers-shared";
import { UserError } from "../errors";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import { logDeployment, pickDeployment } from "./cli/deployments";
import { wrap } from "./helpers/wrap";
import type { Config } from "../config";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export function deleteCommandOptionalYargs(yargs: CommonYargsArgv) {
	return yargs.positional("deploymentId", {
		type: "string",
		demandOption: false,
		describe: "deployment you want to delete",
	});
}

export async function deleteCommand(
	deleteArgs: StrictYargsOptionsToInterface<typeof deleteCommandOptionalYargs>,
	config: Config
) {
	if (isNonInteractiveOrCI()) {
		if (!deleteArgs.deploymentId) {
			throw new Error(
				"there needs to be a deploymentId when you can't interact with the wrangler cli"
			);
		}

		const deployment = await DeploymentsService.deleteDeploymentV2(
			deleteArgs.deploymentId
		);
		logger.json(deployment);
		return;
	}

	await handleDeleteCommand(deleteArgs, config);
}

async function handleDeleteCommand(
	args: StrictYargsOptionsToInterface<typeof deleteCommandOptionalYargs>,
	_config: Config
) {
	startSection("Delete your deployment");
	const deployment = await pickDeployment(args.deploymentId);
	logDeployment(deployment);
	const yes = await inputPrompt({
		question: "Are you sure that you want to delete this deployment?",
		type: "confirm",
		label: "",
	});
	if (!yes) {
		cancel("The operation has been cancelled");
		return;
	}

	const [, err] = await wrap(
		DeploymentsService.deleteDeploymentV2(deployment.id)
	);
	if (err) {
		throw new UserError(
			`There has been an internal error deleting your deployment.\n ${err.message}`
		);
	}
	endSection("Your container has been deleted");
}
