import {
	versionsUpload,
	type AssetUploadStats,
} from "@cloudflare/deploy-helpers";
import { analyseBundle } from "../check/commands";
import { createCommand } from "../core/create-command";
import {
	sharedDeployVersionsArgs,
	validateDeployVersionsArgs,
} from "../deployment-bundle/deploy-args";
import { buildWorker } from "../deployment-bundle/maybe-build-worker";
import {
	cleanupDestination,
	mergeVersionsUploadConfigArgs,
} from "../deployment-bundle/merge-config-args";
import { experimentalNewConfigArg } from "../experimental-config/cli-flag";
import * as metrics from "../metrics";
import { writeOutput } from "../output";
import { getScriptName } from "../utils/getScriptName";

export const versionsUploadCommand = createCommand({
	metadata: {
		description: "Uploads your Worker code and config as a new Version",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	positionalArgs: ["path"],
	args: {
		...experimentalNewConfigArg,
		...sharedDeployVersionsArgs,
		"preview-alias": {
			describe: "Name of an alias for this Worker version",
			type: "string",
			requiresArg: true,
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
		suggestSkillsAfterHandler: true,
	},
	validateArgs(args) {
		validateDeployVersionsArgs(args, "versions upload");
	},
	handler: async function versionsUploadHandler(args, { config }) {
		// Merge CLI args with config (includes Sites validation and assets validation)
		const { props, buildProps } = await mergeVersionsUploadConfigArgs(
			args,
			config
		);
		let assetUploadStats: AssetUploadStats | undefined;

		try {
			// Derive workerNameOverridden by comparing pre-merge name with post-merge name
			const preMergeName = getScriptName(args, config);
			const workerNameOverridden =
				props.name !== undefined && props.name !== preMergeName;

			const buildResult = await buildWorker(buildProps, config);

			const {
				versionId,
				workerTag,
				assetUploadStats: uploadStats,
				versionPreviewUrl,
				versionPreviewAliasUrl,
			} = await versionsUpload(props, config, buildResult, {
				analyseBundle: analyseBundle,
			});
			assetUploadStats = uploadStats;

			writeOutput({
				type: "version-upload",
				version: 1,
				worker_name: props.name ?? null,
				worker_tag: workerTag,
				version_id: versionId,
				preview_url: versionPreviewUrl,
				preview_alias_url: versionPreviewAliasUrl,
				wrangler_environment: args.env,
				worker_name_overridden: workerNameOverridden,
			});
		} finally {
			metrics.sendMetricsEvent(
				"upload worker version",
				{
					usesTypeScript: /\.tsx?$/.test(props.entry.file),
					...assetUploadStats,
				},
				{
					sendMetrics: config.send_metrics,
				}
			);
			cleanupDestination(buildProps.destination);
		}
	},
});

export type VersionsUploadArgs = (typeof versionsUploadCommand)["args"];
