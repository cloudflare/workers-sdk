import { initDeployHelpersContext } from "@cloudflare/deploy-helpers/context";
import {
	fetchKVGetValue,
	fetchListResult,
	fetchPagedListResult,
	fetchResult,
} from "../cfetch";
import { readConfig } from "../config";
import { runDeployCommandHandler, type DeployArgs } from "../deploy";
import { confirm, prompt, select } from "../dialogs";
import { run } from "../experimental-flags";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import {
	recordPagesToWorkersRedirectFailure,
	recordPagesToWorkersRedirectSuccess,
	runWithPagesToWorkersRedirect,
	type PagesToWorkersRedirectResult,
} from "./redirect-to-workers";

export async function runPagesToWorkersDeploy(
	redirect: Extract<PagesToWorkersRedirectResult, { handled: true }>
): Promise<void> {
	const args = {
		_: ["deploy"],
		$0: "wrangler",
		autoconfig: true,
		...redirect.deployArgs,
	} as DeployArgs;
	const config = readConfig(args, {
		useRedirectIfAvailable: true,
	});
	const experimentalFlags = {
		MULTIWORKER: false,
		RESOURCES_PROVISION: args.experimentalProvision ?? false,
		AUTOCREATE_RESOURCES: args.experimentalAutoCreate,
	};

	try {
		await run(experimentalFlags, () =>
			runWithPagesToWorkersRedirect(async () => {
				initDeployHelpersContext({
					logger,
					fetchResult,
					fetchListResult,
					fetchPagedListResult,
					fetchKVGetValue,
					confirm,
					prompt,
					select,
					isNonInteractiveOrCI,
				});

				await runDeployCommandHandler(args, { config });
			})
		);
	} catch (error) {
		recordPagesToWorkersRedirectFailure(
			redirect.command,
			redirect.deployArgs,
			redirect.agentId,
			error
		);
		throw error;
	}

	recordPagesToWorkersRedirectSuccess(
		redirect.command,
		redirect.deployArgs,
		redirect.agentId
	);
}
