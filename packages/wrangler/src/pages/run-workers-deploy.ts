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
	recordPagesToWorkersDelegateFailure,
	recordPagesToWorkersDelegateSuccess,
	runWithPagesToWorkersDelegation,
	type PagesToWorkersDelegateResult,
} from "./delegate-to-workers";

export async function runPagesToWorkersDeploy(
	delegation: Extract<PagesToWorkersDelegateResult, { handled: true }>
): Promise<void> {
	const args = {
		_: ["deploy"],
		$0: "wrangler",
		autoconfig: true,
		...delegation.deployArgs,
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
			runWithPagesToWorkersDelegation(async () => {
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
		recordPagesToWorkersDelegateFailure(
			delegation.command,
			delegation.deployArgs,
			delegation.agentId,
			error
		);
		throw error;
	}

	recordPagesToWorkersDelegateSuccess(
		delegation.command,
		delegation.deployArgs,
		delegation.agentId
	);
}
