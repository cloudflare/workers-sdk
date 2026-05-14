import assert from "node:assert";
import path from "node:path";
import {
	getTodaysCompatDate,
	getCIOverrideName,
	UserError,
} from "@cloudflare/workers-utils";
import { getAssetsOptions, validateAssetsArgsAndConfig } from "../assets";
import { createCommand } from "../core/create-command";
import {
	sharedDeployVersionsArgs,
	validateDeployVersionsArgs,
} from "../deployment-bundle/deploy-args";
import { getEntry } from "../deployment-bundle/entry";
import { logger } from "../logger";
import { verifyWorkerMatchesCITag } from "../match-tag";
import * as metrics from "../metrics";
import { writeOutput } from "../output";
import { getSiteAssetPaths } from "../sites";
import { requireAuth } from "../user";
import { collectKeyValues } from "../utils/collectKeyValues";
import { getRules } from "../utils/getRules";
import { getScriptName } from "../utils/getScriptName";
import { useServiceEnvironments } from "../utils/useServiceEnvironments";
import { maybeRunAutoConfig, promptForMissingConfig } from "./autoconfig";
import deploy from "./deploy";
import { maybeDelegateToOpenNextDeployCommand } from "./open-next";

export const deployCommand = createCommand({
	metadata: {
		description: "🆙 Deploy a Worker to Cloudflare",
		owner: "Workers: Deploy and Config",
		status: "stable",
		category: "Compute & AI",
	},
	positionalArgs: ["script"],
	args: {
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
		"legacy-env": {
			type: "boolean",
			describe: "Use legacy environments",
			hidden: true,
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
				"Rollout strategy for Containers changes. If set to immediate, it will override `rollout_percentage_steps` if configured and roll out to 100% of instances in one step. ",
			choices: ["immediate", "gradual"] as const,
		},
		strict: {
			describe:
				"Enables strict mode for the deploy command, this prevents deployments to occur when there are even small potential risks.",
			type: "boolean",
			default: false,
		},
		"experimental-autoconfig": {
			alias: ["x-autoconfig"],
			describe:
				"Experimental: Enables framework detection and automatic configuration when deploying",
			type: "boolean",
			default: true,
		},
	},
	behaviour: {
		useConfigRedirectIfAvailable: true,
		overrideExperimentalFlags: (args) => ({
			MULTIWORKER: false,
			RESOURCES_PROVISION: args.experimentalProvision ?? false,
			AUTOCREATE_RESOURCES: args.experimentalAutoCreate,
		}),
		warnIfMultipleEnvsConfiguredButNoneSpecified: true,
		printMetricsBanner: true,
	},
	validateArgs(args) {
		validateDeployVersionsArgs(args);
	},
	async handler(args, { config }) {
		// --- Step 0. Auto-config --- //
		const autoConfigResult = await maybeRunAutoConfig(args, config);
		if (autoConfigResult.aborted) {
			return;
		}
		config = autoConfigResult.config;

		// Interatively handle missing/incorrect --assets, --script, --name, --compatibility-date
		args = await promptForMissingConfig(args, config);

		// Needs to happen after auto-config logic to capture newly auto-configured open-next apps.
		// As a precaution we're gating the feature under the autoconfig flag for the time being.
		// If the user explicitly provided a --config path, they are targeting a specific Worker config and we should not delegate
		if (
			args.experimentalAutoconfig &&
			!args.config &&
			!args.dryRun &&
			(await maybeDelegateToOpenNextDeployCommand(process.cwd()))
		) {
			return;
		}

		const entry = await getEntry(args, config, "deploy");
		validateAssetsArgsAndConfig(args, config);

		const assetsOptions = getAssetsOptions({
			args,
			config,
		});

		const cliVars = collectKeyValues(args.var);
		const cliDefines = collectKeyValues(args.define);
		const cliAlias = collectKeyValues(args.alias);

		const accountId = args.dryRun ? undefined : await requireAuth(config);

		const siteAssetPaths = getSiteAssetPaths(
			config,
			args.site,
			args.siteInclude,
			args.siteExclude
		);

		const beforeUpload = Date.now();
		let name = getScriptName(args, config);

		const ciOverrideName = getCIOverrideName();
		let workerNameOverridden = false;
		if (ciOverrideName !== undefined && ciOverrideName !== name) {
			logger.warn(
				`Failed to match Worker name. Your config file is using the Worker name "${name}", but the CI system expected "${ciOverrideName}". Overriding using the CI provided Worker name. Workers Builds connected builds will attempt to open a pull request to resolve this config name mismatch.`
			);
			name = ciOverrideName;
			workerNameOverridden = true;
		}

		if (!name) {
			throw new UserError(
				'You need to provide a name when publishing a worker. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`',
				{ telemetryMessage: "deploy command missing worker name" }
			);
		}

		if (!args.dryRun) {
			assert(accountId, "Missing account ID");
			await verifyWorkerMatchesCITag(
				config,
				accountId,
				name,
				config.configPath
			);
		}

		// We use the `userConfigPath` to compute the root of a project,
		// rather than a redirected (potentially generated) `configPath`.
		const projectRoot =
			config.userConfigPath && path.dirname(config.userConfigPath);

		const { sourceMapSize, versionId, workerTag, targets } = await deploy({
			config,
			accountId,
			name,
			rules: getRules(config),
			entry,
			env: args.env,
			compatibilityDate: args.latest
				? getTodaysCompatDate()
				: args.compatibilityDate,
			compatibilityFlags: args.compatibilityFlags,
			vars: cliVars,
			defines: cliDefines,
			alias: cliAlias,
			triggers: args.triggers,
			jsxFactory: args.jsxFactory,
			jsxFragment: args.jsxFragment,
			tsconfig: args.tsconfig,
			routes: args.routes,
			domains: args.domains,
			assetsOptions,
			legacyAssetPaths: siteAssetPaths,
			useServiceEnvironments: useServiceEnvironments(config),
			minify: args.minify,
			isWorkersSite: Boolean(args.site || config.site),
			outDir: args.outdir,
			outFile: args.outfile,
			dryRun: args.dryRun,
			metafile: args.metafile,
			noBundle: !(args.bundle ?? !config.no_bundle),
			keepVars: args.keepVars,
			logpush: args.logpush,
			uploadSourceMaps: args.uploadSourceMaps,
			oldAssetTtl: args.oldAssetTtl,
			projectRoot,
			dispatchNamespace: args.dispatchNamespace,
			experimentalAutoCreate: args.experimentalAutoCreate,
			containersRollout: args.containersRollout,
			strict: args.strict,
			tag: args.tag,
			message: args.message,
			secretsFile: args.secretsFile,
		});

		writeOutput({
			type: "deploy",
			version: 1,
			worker_name: name ?? null,
			worker_tag: workerTag,
			version_id: versionId,
			targets,
			wrangler_environment: args.env,
			worker_name_overridden: workerNameOverridden,
		});

		metrics.sendMetricsEvent(
			"deploy worker script",
			{
				usesTypeScript: /\.tsx?$/.test(entry.file),
				durationMs: Date.now() - beforeUpload,
				sourceMapSize,
			},
			{
				sendMetrics: config.send_metrics,
			}
		);
	},
});

export type DeployArgs = (typeof deployCommand)["args"];
