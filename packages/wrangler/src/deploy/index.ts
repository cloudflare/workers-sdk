import { deploy } from "@cloudflare/deploy-helpers";
import { analyseBundle } from "../check/commands";
import { buildContainer } from "../containers/build";
import { getNormalizedContainerOptions } from "../containers/config";
import { deployContainers } from "../containers/deploy";
import { createCommand } from "../core/create-command";
import {
	sharedDeployVersionsArgs,
	validateDeployVersionsArgs,
} from "../deployment-bundle/deploy-args";
import { buildWorker } from "../deployment-bundle/maybe-build-worker";
import {
	cleanupDestination,
	mergeDeployConfigArgs,
} from "../deployment-bundle/merge-config-args";
import { experimentalNewConfigArg } from "../experimental-config/cli-flag";
import { isNonInteractiveOrCI } from "../is-interactive";
import * as metrics from "../metrics";
import { writeOutput } from "../output";
import { syncWorkersSite } from "../sites";
import { getScriptName } from "../utils/getScriptName";
import { maybeRunAutoConfig, promptForMissingDeployConfig } from "./autoconfig";
import { maybeDelegateToOpenNextDeployCommand } from "./open-next";
import type { Config } from "@cloudflare/workers-utils";

export const deployCommand = createCommand({
	metadata: {
		description: "🆙 Deploy a Worker to Cloudflare",
		owner: "Workers: Deploy and Config",
		status: "stable",
		category: "Compute & AI",
	},
	positionalArgs: ["path"],
	args: {
		...experimentalNewConfigArg,
		...sharedDeployVersionsArgs,
		triggers: {
			describe: "cron schedules to attach",
			alias: ["schedule", "schedules"],
			type: "string",
			requiresArg: true,
			array: true,
		},
		routes: {
			describe: "Routes to upload",
			alias: "route",
			type: "string",
			requiresArg: true,
			array: true,
		},
		domains: {
			describe: "Custom domains to deploy to",
			alias: "domain",
			type: "string",
			requiresArg: true,
			array: true,
		},
		metafile: {
			describe:
				"Path to output build metadata from esbuild. If flag is used without a path, defaults to 'bundle-meta.json' inside the directory specified by --outdir.",
			type: "string",
			coerce: (v: string) => (!v ? true : v),
		},
		logpush: {
			type: "boolean",
			describe:
				"Send Trace Events from this Worker to Workers Logpush.\nThis will not configure a corresponding Logpush job automatically.",
		},
		"old-asset-ttl": {
			describe:
				"Expire old assets in given seconds rather than immediate deletion.",
			type: "number",
		},
		"dispatch-namespace": {
			describe:
				"Name of a dispatch namespace to deploy the Worker to (Workers for Platforms)",
			type: "string",
		},
		"containers-rollout": {
			describe:
				"Rollout strategy for Containers changes. If set to immediate, it will override `rollout_percentage_steps` if configured and roll out to 100% of instances in one step. If set to none, the Worker will be deployed without building or updating any Containers.",
			choices: ["immediate", "gradual", "none"] as const,
		},
		autoconfig: {
			describe:
				"Enables framework detection and automatic configuration when deploying",
			type: "boolean",
			default: true,
		},
	},
	behaviour: {
		supportTemporary: true,
		useConfigRedirectIfAvailable: true,
		overrideExperimentalFlags: (args) => ({
			MULTIWORKER: false,
			RESOURCES_PROVISION: args.experimentalProvision ?? false,
			AUTOCREATE_RESOURCES: args.experimentalAutoCreate,
		}),
		warnIfMultipleEnvsConfiguredButNoneSpecified: true,
		printMetricsBanner: true,
		suggestSkillsAfterHandler: true,
	},
	validateArgs(args) {
		validateDeployVersionsArgs(args, "deploy");
	},
	async handler(args, { config }) {
		await runDeployCommandHandler(args, { config });
	},
});

export type DeployArgs = (typeof deployCommand)["args"];

export async function runDeployCommandHandler(
	args: DeployArgs,
	{
		config,
		pagesToWorkersDelegation = false,
	}: { config: Config; pagesToWorkersDelegation?: boolean }
): Promise<void> {
	// Capture whether this project can prove it owns the target Worker name,
	// BEFORE autoconfig generates or rewrites the config. Ownership is proven by
	// a config file that names the Worker; without one a same-named remote Worker
	// is a probable collision rather than a redeploy. We only guard
	// non-interactive deploys (agents, CI, the Pages-to-Workers delegation):
	// there we cannot prompt to resolve the collision, and silently overwriting
	// an unrelated Worker is the worst outcome. Interactive users pick the name
	// at a prompt and keep the existing confirmation flow.
	//
	// For the Pages-to-Workers delegation we guard even when a name was passed:
	// the name is a Pages project name carried across, and an existing Worker of
	// the same name is a different resource we must not clobber. Repeat
	// delegations are unaffected because the first one writes a config file
	// (so `configPath` is then set). Outside the delegation, an explicit `--name`
	// is treated as deliberate ownership so plain `wrangler deploy --name foo`
	// keeps working in CI. See `failIfWorkerNameTaken` in preUploadApiChecks.
	const nameOwnershipUnverified =
		!config.configPath &&
		isNonInteractiveOrCI() &&
		(pagesToWorkersDelegation || !args.name);

	// --- Step 0. Auto-config --- //
	const autoConfigResult = await maybeRunAutoConfig(args, config, {
		skipConfirmations: pagesToWorkersDelegation,
	});
	if (autoConfigResult.aborted) {
		return;
	}
	config = autoConfigResult.config;

	// Interatively handle missing/incorrect --assets, --script, --name, --compatibility-date
	args = await promptForMissingDeployConfig(args, config);

	// Needs to happen after auto-config logic to capture newly auto-configured open-next apps.
	// As a precaution we're gating the feature under the autoconfig flag for the time being.
	// If the user explicitly provided a --config path, they are targeting a specific Worker config and we should not delegate
	if (
		!pagesToWorkersDelegation &&
		args.autoconfig &&
		!args.config &&
		!args.dryRun &&
		(await maybeDelegateToOpenNextDeployCommand(process.cwd()))
	) {
		return;
	}

	// Merge CLI args with config into props for building and deploying
	const { props, buildProps } = await mergeDeployConfigArgs(args, config);
	props.failIfWorkerNameTaken = nameOwnershipUnverified;

	try {
		// Derive workerNameOverridden by comparing pre-merge name with post-merge name
		const preMergeName = getScriptName(args, config);
		const workerNameOverridden =
			props.name !== undefined && props.name !== preMergeName;

		const beforeUpload = Date.now();

		const buildResult = await buildWorker(buildProps, config);

		const { sourceMapSize, versionId, workerTag, assetUploadStats, targets } =
			await deploy(props, config, buildResult, {
				syncWorkersSite,
				getNormalizedContainerOptions,
				buildContainer,
				deployContainers,
				analyseBundle,
			});

		writeOutput({
			type: "deploy",
			version: 1,
			worker_name: props.name ?? null,
			worker_tag: workerTag,
			version_id: versionId,
			targets,
			wrangler_environment: args.env,
			worker_name_overridden: workerNameOverridden,
		});

		metrics.sendMetricsEvent(
			"deploy worker script",
			{
				usesTypeScript: /\.tsx?$/.test(props.entry.file),
				durationMs: Date.now() - beforeUpload,
				sourceMapSize,
				...assetUploadStats,
			},
			{
				sendMetrics: config.send_metrics,
			}
		);
	} finally {
		cleanupDestination(buildProps.destination);
	}
}
