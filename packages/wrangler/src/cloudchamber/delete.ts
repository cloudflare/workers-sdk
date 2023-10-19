import { startSection, error, endSection, cancel } from "@cloudflare/cli";
import { inputPrompt } from "@cloudflare/cli/interactive";
import { logDeployment, pickDeployment } from "./cli/deployments";
import { DeploymentsService } from "./client";
import { handleFailure, interactWithUser, loadAccountSpinner } from "./common";
import { wrap } from "./helpers/wrap";
import type { CommonYargsOptions } from "../yargs-types";
import type {
	CommonCloudchamberConfiguration,
	CloudchamberConfiguration,
	inferYargsFn,
} from "./common";
import type { Argv } from "yargs";

function deleteCommandOptionalYargs<T>(yargs: Argv<T>) {
	return yargs.positional("deploymentId", {
		type: "string",
		demandOption: false,
		describe: "deployment you want to delete",
	});
}

export const deleteCommand = (
	yargs: Argv<CommonYargsOptions & CommonCloudchamberConfiguration>
) => {
	return yargs.command(
		"delete [deploymentId]",
		"Delete an existing deployment that is running in the Cloudflare edge",
		(args) => deleteCommandOptionalYargs(args),
		(args) =>
			handleFailure<typeof args>(async (deleteArgs, config) => {
				await loadAccountSpinner(config);
				if (!interactWithUser(config)) {
					if (!deleteArgs.deploymentId) {
						throw new Error(
							"there needs to be a deploymentId when you can't interact with the wrangler cli"
						);
					}

					const deployment = await DeploymentsService.deleteDeployment(
						deleteArgs.deploymentId
					);
					console.log(JSON.stringify(deployment), null, 4);
					return;
				}

				await handleDeleteCommand(deleteArgs, config);
			})(args)
	);
};

async function handleDeleteCommand(
	args: inferYargsFn<typeof deleteCommandOptionalYargs>,
	_config: CloudchamberConfiguration
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
		DeploymentsService.deleteDeployment(deployment.id)
	);
	if (err) {
		error(
			`There has been an internal error deleting your deployment.\n ${err.message}`
		);
		return;
	}
	endSection("Your container has been deleted");
}
