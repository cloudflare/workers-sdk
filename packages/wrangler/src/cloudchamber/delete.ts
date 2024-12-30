import { cancel, crash, endSection, startSection } from "@cloudflare/cli";
import { inputPrompt } from "@cloudflare/cli/interactive";
import { logDeployment, pickDeployment } from "./cli/deployments";
import { DeploymentsService } from "./client";
import { interactWithUser, loadAccountSpinner } from "./common";
import { wrap } from "./helpers/wrap";
import type { Config } from "../../../wrangler-shared/src/config";
import type {
	CommonYargsArgvJSON,
	StrictYargsOptionsToInterfaceJSON,
} from "../yargs-types";

export function deleteCommandOptionalYargs(yargs: CommonYargsArgvJSON) {
	return yargs.positional("deploymentId", {
		type: "string",
		demandOption: false,
		describe: "deployment you want to delete",
	});
}

export async function deleteCommand(
	deleteArgs: StrictYargsOptionsToInterfaceJSON<
		typeof deleteCommandOptionalYargs
	>,
	config: Config
) {
	await loadAccountSpinner(deleteArgs);
	if (!interactWithUser(deleteArgs)) {
		if (!deleteArgs.deploymentId) {
			throw new Error(
				"there needs to be a deploymentId when you can't interact with the wrangler cli"
			);
		}

		const deployment = await DeploymentsService.deleteDeploymentV2(
			deleteArgs.deploymentId
		);
		console.log(JSON.stringify(deployment), null, 4);
		return;
	}

	await handleDeleteCommand(deleteArgs, config);
}

async function handleDeleteCommand(
	args: StrictYargsOptionsToInterfaceJSON<typeof deleteCommandOptionalYargs>,
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
		crash(
			`There has been an internal error deleting your deployment.\n ${err.message}`
		);
		return;
	}
	endSection("Your container has been deleted");
}
