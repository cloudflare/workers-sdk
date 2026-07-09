import { initDeployHelpersContext } from "@cloudflare/deploy-helpers/context";
import { isNonInteractiveOrCI } from "@cloudflare/workers-utils";
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
import { logger } from "../logger";
import {
	recordPagesToWorkersDelegateFailure,
	recordPagesToWorkersDelegateSuccess,
	type PagesToWorkersDelegateResult,
} from "./delegate-to-workers";

export async function runPagesToWorkersDeploy(
	delegation: Extract<PagesToWorkersDelegateResult, { delegate: true }>
): Promise<void> {
	// This path invokes the deploy handler directly, bypassing yargs, so it must
	// supply every `DeployArgs` field the parser would otherwise populate. Fields
	// without a yargs default are set to `undefined` (what a real `wrangler
	// deploy` produces when the flag is absent); the few with a default mirror
	// the values from the `wrangler deploy` command definition. Using `satisfies
	// DeployArgs` rather than casting makes the compiler flag this object if the
	// command's arg shape ever changes.
	const deployArgs = {
		_: ["deploy"],
		$0: "wrangler",
		// Defaults mirrored from the `wrangler deploy` command definition.
		autoconfig: true,
		experimentalAutoCreate: true,
		installSkills: false,
		experimentalDeployHelpers: false,
		experimentalNewConfig: false,
		latest: false,
		keepVars: false,
		noBundle: false,
		strict: false,
		// No yargs default: an absent flag parses as `undefined`.
		v: undefined,
		cwd: undefined,
		config: undefined,
		env: undefined,
		envFile: undefined,
		experimentalProvision: undefined,
		profile: undefined,
		triggers: undefined,
		routes: undefined,
		domains: undefined,
		metafile: undefined,
		legacyEnv: undefined,
		logpush: undefined,
		oldAssetTtl: undefined,
		dispatchNamespace: undefined,
		containersRollout: undefined,
		path: undefined,
		script: undefined,
		name: undefined,
		tag: undefined,
		message: undefined,
		bundle: undefined,
		outdir: undefined,
		outfile: undefined,
		compatibilityDate: undefined,
		compatibilityFlags: undefined,
		assets: undefined,
		site: undefined,
		siteInclude: undefined,
		siteExclude: undefined,
		var: undefined,
		define: undefined,
		alias: undefined,
		jsxFactory: undefined,
		jsxFragment: undefined,
		tsconfig: undefined,
		minify: undefined,
		uploadSourceMaps: undefined,
		nodeCompat: undefined,
		dryRun: undefined,
		secretsFile: undefined,
		// The agent's explicit inputs (name, compatibility date/flags) override
		// the `undefined` placeholders above.
		...delegation.deployArgs,
	} satisfies DeployArgs;
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
