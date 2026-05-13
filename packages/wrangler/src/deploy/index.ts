import assert from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cancel } from "@cloudflare/cli-shared-helpers";
import { getDockerPath } from "@cloudflare/workers-utils";
import { Response } from "undici";
import { buildAssetManifest, syncAssets } from "../assets";
import { buildContainer } from "../containers/build";
import { deployContainers } from "../containers/deploy";
import { createCommand } from "../core/create-command";
import { getBindings, provisionBindings } from "../deployment-bundle/bindings";
import { buildWorker } from "../deployment-bundle/build-worker";
import { createWorkerUploadForm } from "../deployment-bundle/create-worker-upload-form";
import { sharedDeployVersionsArgs } from "../deployment-bundle/deploy-args";
import { runAuthedValidation } from "../deployment-bundle/pre-deploy-validation";
import {
	resolveDeployInput,
	validateDeployVersionsArgs,
} from "../deployment-bundle/resolve-input";
import {
	createCfWorkerInit,
	uploadViaLegacyApi,
	uploadViaVersionsApi,
} from "../deployment-bundle/upload";
import { getMigrationsToUpload } from "../durable";
import { getFlag } from "../experimental-flags";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { writeOutput } from "../output";
import { syncWorkersSite } from "../sites";
import triggersDeploy from "../triggers/deploy";
import { requireAuth } from "../user";
import { printBindings } from "../utils/print-bindings";
import { useServiceEnvironments } from "../utils/useServiceEnvironments";
import { maybeRunAutoConfig, promptForMissingConfig } from "./autoconfig";
import { addWorkersSitesBindings, formatTime } from "./helpers";
import type { DeployProps } from "../deployment-bundle/resolve-input";
import type { Config } from "@cloudflare/workers-utils";

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
		"keep-vars": {
			describe:
				"When not used (or set to false), Wrangler will delete all vars before setting those found in the Wrangler configuration.\n" +
				"When used (and set to true), the environment variables are not deleted before the deployment.\n" +
				"If you set variables via the dashboard you probably want to use this flag.\n" +
				"Note that secrets are never deleted by deployments.",
			default: false,
			type: "boolean",
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
		const autoConfigResult = await maybeRunAutoConfig(args, config);
		if (autoConfigResult.aborted) {
			return;
		}
		config = autoConfigResult.config;

		// maybe move this into autoconfig?
		args = await promptForMissingConfig(args, config);

		const props = await resolveDeployInput(args, config);
		const result = await executeDeploy(props);

		writeOutput({
			type: "deploy",
			version: 1,
			worker_name: result.props.name ?? null,
			worker_tag: result.workerTag,
			version_id: result.versionId,
			targets: result.targets,
			wrangler_environment: result.props.env,
			worker_name_overridden: result.props.workerNameOverridden ?? false,
		});

		metrics.sendMetricsEvent(
			"deploy worker script",
			{
				usesTypeScript: /\.tsx?$/.test(result.props.entry.file),
				durationMs: Date.now() - result.beforeUpload,
				sourceMapSize: result.sourceMapSize,
			},
			{
				sendMetrics: config.send_metrics,
			}
		);
	},
});

export type DeployArgs = (typeof deployCommand)["args"];

type DeployResult = {
	props: DeployProps;
	versionId: string | null;
	workerTag: string | null;
	targets?: string[];
	sourceMapSize?: number;
	beforeUpload: number;
	aborted: boolean;
};

async function executeDeploy(props: DeployProps): Promise<DeployResult> {
	// presumably this is okay for cf deploy because unnecessary args can be set to 'undefined'?
	const config = props.config;
	const beforeUpload = Date.now();
	const accountId = props.dryRun ? undefined : await requireAuth(config);

	let workerTag: string | null = null;
	let versionId: string | null = null;
	let tags: string[] = [];
	let workerExists = true;

	// Pre-deploy validation (read-only checks + user confirmations)
	if (!props.dryRun) {
		assert(accountId, "Missing account ID");

		const validationResult = await runAuthedValidation({
			...props,
			accountId,
		});

		if (validationResult.aborted) {
			cancel("Aborting deploy...");
			return {
				props,
				versionId,
				workerTag: validationResult.workerTag,
				targets: undefined,
				sourceMapSize: undefined,
				beforeUpload,
				aborted: true,
			};
		}

		workerTag = validationResult.workerTag;
		tags = validationResult.tags;
		workerExists = validationResult.workerExists;
	}

	const serviceEnvName = props.env ?? "production";

	const workerName = props.useServiceEnvApiPath
		? `${props.name} (${serviceEnvName})`
		: props.name;

	const workerUrl = props.dispatchNamespace
		? `/accounts/${accountId}/workers/dispatch/namespaces/${props.dispatchNamespace}/scripts/${props.name}`
		: props.useServiceEnvApiPath
			? `/accounts/${accountId}/workers/services/${props.name}/environments/${serviceEnvName}`
			: `/accounts/${accountId}/workers/scripts/${props.name}`;

	let sourceMapSize;

	try {
		// we need to be able to separate this step out for buildWorker
		const buildResult = await buildWorker(props, config);
		const { modules } = buildResult;

		const migrations = !props.dryRun
			? await getMigrationsToUpload(props.name, {
					accountId,
					config,
					useServiceEnvironments: useServiceEnvironments(config),
					env: props.env,
					dispatchNamespace: props.dispatchNamespace,
				})
			: undefined;

		let assetsJwt: string | undefined = undefined;
		if (props.assetsOptions) {
			if (props.dryRun) {
				await buildAssetManifest(props.assetsOptions.directory);
			} else {
				assetsJwt = await syncAssets(
					config,
					accountId,
					props.assetsOptions.directory,
					props.name,
					props.dispatchNamespace
				);
			}
		}

		const workersSitesAssets = await syncWorkersSite(
			config,
			accountId,
			props.name + (props.useServiceEnvApiPath ? `-${props.env}` : ""),
			props.legacyAssetPaths,
			false,
			props.dryRun,
			props.oldAssetTtl
		);

		if (workersSitesAssets.manifest) {
			modules.push({
				name: "__STATIC_CONTENT_MANIFEST",
				filePath: undefined,
				content: JSON.stringify(workersSitesAssets.manifest),
				type: "text",
			});
		}

		const bindings = await getBindings(config, {
			...props,
			workerExists,
		});

		if (!props.dryRun) {
			assert(accountId, "Missing accountId");
			if (getFlag("RESOURCES_PROVISION")) {
				await provisionBindings(
					bindings ?? {},
					accountId,
					props.name,
					props.experimentalAutoCreate,
					config
				);
			}
		}

		const worker = createCfWorkerInit(props, config, buildResult, {
			migrations,
			assetsJwt,
		});

		sourceMapSize = worker.sourceMaps?.reduce(
			(acc, m) => acc + m.content.length,
			0
		);

		const workerBundle = createWorkerUploadForm(
			worker,
			addWorkersSitesBindings(
				bindings ?? {},
				workersSitesAssets.namespace,
				workersSitesAssets.manifest,
				props.entry.format
			),
			{
				dryRun: props.dryRun ? true : undefined,
				unsafe: config.unsafe,
			}
		);

		if (!props.dryRun) {
			assert(accountId, "Missing account ID");
			const canUseNewVersionsDeploymentsApi =
				workerExists &&
				props.dispatchNamespace === undefined &&
				!props.useServiceEnvApiPath &&
				props.entry.format === "modules" &&
				migrations === undefined &&
				!config.first_party_worker &&
				config.containers === undefined;
			const uploadResult = canUseNewVersionsDeploymentsApi
				? await uploadViaVersionsApi(
						props,
						config,
						accountId,
						workerBundle,
						tags,
						worker,
						buildResult
					)
				: await uploadViaLegacyApi(
						props,
						config,
						accountId,
						workerUrl,
						workerBundle,
						tags,
						buildResult
					);

			versionId = uploadResult.versionId;
		}
		printBindings(
			bindings,
			config.tail_consumers,
			config.streaming_tail_consumers,
			config.containers,
			{
				warnIfNoBindings: props.dryRun,
				unsafeMetadata: config.unsafe?.metadata,
			}
		);
		if (props.outfile) {
			mkdirSync(path.dirname(props.outfile), { recursive: true });
			const serializedFormData = await new Response(workerBundle).arrayBuffer();
			writeFileSync(props.outfile, Buffer.from(serializedFormData));
		}
	} finally {
		if (typeof props.destination !== "string") {
			props.destination.remove();
		}
	}

	if (props.dryRun) {
		if (props.containers.length) {
			for (const container of props.containers) {
				if ("dockerfile" in container) {
					await buildContainer(
						container,
						workerTag ?? "worker-tag",
						props.dryRun,
						getDockerPath()
					);
				}
			}
		}
		logger.log(`--dry-run: exiting now.`);
		return {
			props,
			versionId,
			workerTag,
			sourceMapSize,
			beforeUpload,
			aborted: false,
		};
	}

	assert(accountId, "Missing account ID");
	const uploadMs = Date.now() - beforeUpload;
	logger.log("Uploaded", workerName, formatTime(uploadMs));

	if (props.containers.length > 0) {
		assert(versionId);
		await deployContainers(config, props.containers, {
			versionId,
			accountId,
			scriptName: props.name,
		});
	}

	if (props.dispatchNamespace !== undefined) {
		logger.log("  Dispatch Namespace:", props.dispatchNamespace);
		logger.log("Current Version ID:", versionId);
		return {
			props,
			versionId,
			workerTag,
			sourceMapSize,
			beforeUpload,
			aborted: false,
		};
	}

	const targets = await triggersDeploy({
		config,
		accountId,
		scriptName: props.name,
		workerName,
		env: props.env,
		crons: props.triggers,
		routes: props.routes,
		useServiceEnvironments: props.useServiceEnvApiPath,
		firstDeploy: !workerExists,
	});

	logger.log("Current Version ID:", versionId);

	return {
		props,
		versionId,
		workerTag,
		targets: targets ?? [],
		sourceMapSize,
		beforeUpload,
		aborted: false,
	};
}
