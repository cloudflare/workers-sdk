import { statSync } from "node:fs";
import { initDeployHelpersContext } from "@cloudflare/deploy-helpers/context";
import { UserError } from "@cloudflare/workers-utils";
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
		zone: undefined,
		zoneId: undefined,
		experimentalRouteZones: false,
		domains: undefined,
		metafile: undefined,
		logpush: undefined,
		oldAssetTtl: undefined,
		dispatchNamespace: undefined,
		containersRollout: undefined,
		durableObjectsCodeUpdateMode: undefined,
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

	// Deploy exactly the directory passed to `pages deploy <directory>`, never a
	// broader one. It is checked up front because autoconfig writes files (config,
	// `.gitignore`, package.json scripts) before the deploy itself validates it.
	//
	// For a project without a Workers config, autoconfig is pinned to the
	// directory so it writes it into the generated config instead of detecting
	// its own (which can resolve to the project root). This applies to static
	// projects; a detected framework deploys its own build output. A project that
	// already has a Workers config skips autoconfig, so there the directory is
	// passed as `--assets`, which takes precedence over the config's own assets
	// directory (Workers Sites configs are left as they are, as they cannot be
	// combined with `--assets`). A Pages-style config (`pages_build_output_dir`)
	// is detected by autoconfig as a Pages project and is not regenerated, so the
	// pin has no effect there.
	const { assetsDirectory } = delegation;
	if (assetsDirectory !== undefined) {
		assertAssetsDirectoryExists(assetsDirectory);
	}
	const hasWorkersConfig =
		config.configPath !== undefined && !config.pages_build_output_dir;
	const handlerArgs =
		assetsDirectory !== undefined && hasWorkersConfig && !config.site
			? { ...deployArgs, assets: assetsDirectory }
			: deployArgs;
	const autoConfigOutputDir = hasWorkersConfig ? undefined : assetsDirectory;

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
			});

			await runDeployCommandHandler(handlerArgs, {
				config,
				pagesToWorkersDelegation: true,
				autoConfigOutputDir,
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

/**
 * Throws a user error unless `directory` exists and is a directory, mirroring
 * the check a direct Pages deploy makes before uploading.
 */
function assertAssetsDirectoryExists(directory: string): void {
	let isDirectory = false;
	try {
		isDirectory = statSync(directory).isDirectory();
	} catch {
		// Missing or inaccessible: reported below.
	}
	if (!isDirectory) {
		throw new UserError(
			`The directory "${directory}" passed to \`wrangler pages deploy\` does not exist or is not a directory.`,
			{ telemetryMessage: "pages to workers delegation directory not found" }
		);
	}
}
