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
	type PagesToWorkersDelegateResult,
} from "./delegate-to-workers";

export async function runPagesToWorkersDeploy(
	delegation: Extract<PagesToWorkersDelegateResult, { handled: true }>
): Promise<void> {
	// This path calls the deploy handler directly, bypassing yargs. Keep these
	// defaults aligned with the `wrangler deploy` command definition for values
	// the delegated deploy path can observe.
	const args = {
		_: ["deploy"],
		$0: "wrangler",
		autoconfig: true,
		experimentalAutoCreate: true,
		experimentalDeployHelpers: false,
		experimentalNewConfig: false,
		latest: false,
		keepVars: false,
		noBundle: false,
		strict: false,
		...delegation.deployArgs,
	} satisfies Partial<DeployArgs>;
	const deployArgs = args as DeployArgs;
	const config = readConfig(deployArgs, {
		useRedirectIfAvailable: true,
	});
	const experimentalFlags = {
		MULTIWORKER: false,
		RESOURCES_PROVISION: deployArgs.experimentalProvision ?? false,
		AUTOCREATE_RESOURCES: deployArgs.experimentalAutoCreate ?? true,
	};

	try {
		await run(experimentalFlags, async () => {
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

			await runDeployCommandHandler(deployArgs, {
				config,
				pagesToWorkersDelegation: true,
			});
		});
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
