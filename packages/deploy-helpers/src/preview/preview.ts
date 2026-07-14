import path from "node:path";
import {
	configFileName,
	getBindingTypeFriendlyName,
	UserError,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import { syncAssets } from "../deploy/helpers/assets";
import { getBindings } from "../deploy/helpers/binding-utils";
import { moduleTypeMimeType } from "../deploy/helpers/create-worker-upload-form";
import { parseConfigPlacement } from "../deploy/helpers/placement";
import { confirm, logger } from "../shared/context";
import {
	createPreview,
	createPreviewDeployment,
	deletePreview,
	editPreview,
	getPreview,
	getPreviewDeployment,
	getWorkerPreviewDefaults,
} from "./api";
import { drawBox, drawConnectedChildBox } from "./box";
import { formatAlignedRows, formatBindings } from "./format";
import {
	assemblePreviewScriptSettings,
	extractConfigBindings,
	getBranchName,
	getHeadCommitMessage,
	getHeadCommitRef,
	resolveWorkerName,
	shouldUseCIMetadataFallback,
} from "./shared";
import type { WorkerBuildResult } from "../shared/types";
import type {
	Binding,
	CreatePreviewDeploymentRequestParams,
	DeploymentResource,
	PreviewResource,
} from "./api";
import type { Config, PreviewsConfig } from "@cloudflare/workers-utils";

type PreviewDeploymentModule = {
	name: string;
	content_type: string;
	content_base64: string;
};

type MergedBinding = Binding & { fromConfig: boolean };

type MergedScriptLevel = {
	observability?: {
		enabled?: boolean;
		head_sampling_rate?: number;
		fromConfig: boolean;
	};
	logpush?: {
		value: boolean;
		fromConfig: boolean;
	};
	tail_consumers?: Array<{ name: string }>;
};

type MergedVersionLevel = {
	compatibility_date?: {
		value: string;
		fromConfig: boolean;
	};
	compatibility_flags?: {
		value: string[];
		fromConfig: boolean;
	};
	limits?: {
		value: Config["limits"];
		fromConfig: boolean;
	};
	placement?: {
		value: { mode: string };
		fromConfig: boolean;
	};
	cache?: {
		value: Config["cache"];
		fromConfig: boolean;
	};
	assets?: {
		value: {
			directory?: string;
			binding?: string;
			html_handling?: string;
			not_found_handling?: string;
			run_worker_first?: string[] | boolean;
		};
		fromConfig: boolean;
	};
	env: Record<string, MergedBinding>;
};

export type PreviewArgs = {
	script?: string;
	name?: string;
	tag?: string;
	message?: string;
	json?: boolean;
	ignoreDefaults: boolean;
	workerName?: string;
	"worker-name"?: string;
};

export type PreviewAssetsOptions = {
	directory: string;
	assetConfig: {
		html_handling?: string;
		not_found_handling?: string;
	};
	run_worker_first?: string[] | boolean;
	_headers?: string;
	_redirects?: string;
};

export type PreviewDeleteArgs = {
	name?: string;
	skipConfirmation?: boolean;
	workerName?: string;
	"worker-name"?: string;
};

export type PreviewResult = {
	preview: PreviewResource;
	deployment: DeploymentResource;
	isNewPreview: boolean;
};

function toBase64(content: string | Uint8Array): string {
	return Buffer.from(content).toString("base64");
}

function getPreviewMigrationsToUpload(
	workerName: string,
	config: Config,
	currentMigrationTag?: string
): CreatePreviewDeploymentRequestParams["migrations"] {
	if (config.migrations.length === 0) {
		return undefined;
	}

	if (currentMigrationTag) {
		const foundIndex = config.migrations.findIndex(
			(migration) => migration.tag === currentMigrationTag
		);
		if (foundIndex === -1) {
			logger.warn(
				`The published preview for ${workerName} has a migration tag "${currentMigrationTag}", which was not found in your ${configFileName(
					config.configPath
				)} file. You may have already deleted it. Applying all available migrations to the preview...`
			);
			return {
				old_tag: currentMigrationTag,
				new_tag: config.migrations[config.migrations.length - 1].tag,
				steps: config.migrations.map(({ tag: _tag, ...rest }) => rest),
			};
		}

		if (foundIndex !== config.migrations.length - 1) {
			return {
				old_tag: currentMigrationTag,
				new_tag: config.migrations[config.migrations.length - 1].tag,
				steps: config.migrations
					.slice(foundIndex + 1)
					.map(({ tag: _tag, ...rest }) => rest),
			};
		}

		return undefined;
	}

	return {
		new_tag: config.migrations[config.migrations.length - 1].tag,
		steps: config.migrations.map(({ tag: _tag, ...rest }) => rest),
	};
}

function buildResultToDeploymentModules(
	buildResult: WorkerBuildResult,
	assetFiles?: { _headers?: string; _redirects?: string }
): { main_module: string; modules: PreviewDeploymentModule[] } {
	const mainModuleName = path.basename(buildResult.resolvedEntryPointPath);
	const mainContentType =
		moduleTypeMimeType[buildResult.bundleType] ?? "application/octet-stream";
	const deploymentModules: PreviewDeploymentModule[] = [
		{
			name: mainModuleName,
			content_type: mainContentType,
			content_base64: toBase64(buildResult.content),
		},
		...buildResult.modules.map((mod) => {
			const contentType =
				moduleTypeMimeType[mod.type ?? "text"] ?? "application/octet-stream";
			return {
				name: mod.name,
				content_type: contentType,
				content_base64: toBase64(mod.content),
			};
		}),
	];

	if (buildResult.sourceMaps) {
		deploymentModules.push(
			...buildResult.sourceMaps.map((sourceMap) => ({
				name: sourceMap.name,
				content_type: "application/source-map",
				content_base64: toBase64(sourceMap.content),
			}))
		);
	}

	if (assetFiles?._headers !== undefined) {
		deploymentModules.push({
			name: "_headers",
			content_type: "text/plain",
			content_base64: toBase64(assetFiles._headers),
		});
	}

	if (assetFiles?._redirects !== undefined) {
		deploymentModules.push({
			name: "_redirects",
			content_type: "text/plain",
			content_base64: toBase64(assetFiles._redirects),
		});
	}

	return { main_module: mainModuleName, modules: deploymentModules };
}

async function assemblePreviewDeploymentSettings(
	config: Config,
	buildResult: WorkerBuildResult,
	accountId: string,
	workerName: string,
	previewIdentifier: string,
	options: {
		message?: string;
		tag?: string;
		assetsOptions?: PreviewAssetsOptions;
	}
): Promise<CreatePreviewDeploymentRequestParams> {
	const previews = config.previews as PreviewsConfig | undefined;
	const request: CreatePreviewDeploymentRequestParams = {};
	const deploymentModules = buildResultToDeploymentModules(buildResult, {
		_headers: options.assetsOptions?._headers,
		_redirects: options.assetsOptions?._redirects,
	});
	request.main_module = deploymentModules.main_module;
	request.modules = deploymentModules.modules;

	if (options.assetsOptions) {
		const assetsUploadResult = await syncAssets(
			config,
			accountId,
			options.assetsOptions.directory,
			workerName
		);
		request.assets = {
			jwt: assetsUploadResult.jwt,
			config: {
				html_handling: options.assetsOptions.assetConfig.html_handling,
				not_found_handling:
					options.assetsOptions.assetConfig.not_found_handling,
				run_worker_first: options.assetsOptions.run_worker_first,
			},
		};
	}

	if (config.compatibility_date) {
		request.compatibility_date = config.compatibility_date;
	}
	if (config.compatibility_flags && config.compatibility_flags.length > 0) {
		request.compatibility_flags = config.compatibility_flags;
	}
	if (options.message || options.tag) {
		request.annotations = {
			...(options.message && { "workers/message": options.message }),
			...(options.tag && { "workers/tag": options.tag }),
		};
	}
	if (config.migrations.length > 0) {
		let latestDeploymentMigrationTag: string | undefined;
		try {
			const latestDeployment = await getPreviewDeployment(
				config,
				accountId,
				workerName,
				previewIdentifier,
				"latest"
			);
			latestDeploymentMigrationTag = latestDeployment.migration_tag;
		} catch (error) {
			if (
				!(
					typeof error === "object" &&
					error !== null &&
					(("status" in error && error.status === 404) ||
						("code" in error && (error.code === 10025 || error.code === 10222)))
				)
			) {
				throw error;
			}
		}
		const migrations = getPreviewMigrationsToUpload(
			workerName,
			config,
			latestDeploymentMigrationTag
		);
		if (migrations) {
			request.migrations = migrations;
		}
	}
	if (previews?.limits !== undefined) {
		request.limits = previews.limits;
	} else if (config.limits !== undefined) {
		request.limits = config.limits;
	}
	if (previews?.cache !== undefined) {
		request.cache = previews.cache;
	} else if (config.cache !== undefined) {
		request.cache = config.cache;
	}
	if (config.placement) {
		request.placement = parseConfigPlacement(config);
	}

	const env = extractConfigBindings(config);
	if (Object.keys(env).length > 0) {
		request.env = env;
	}

	return request;
}

function buildMergedScriptLevel(
	config: Config,
	previewResource: PreviewResource
): MergedScriptLevel {
	const previews = config.previews as PreviewsConfig | undefined;
	const result: MergedScriptLevel = {};
	const configHasObservability =
		previews?.observability !== undefined || config.observability !== undefined;
	const configHasLogpush =
		previews?.logpush !== undefined || config.logpush !== undefined;

	if (previewResource.observability !== undefined) {
		result.observability = {
			enabled: previewResource.observability.enabled,
			head_sampling_rate: previewResource.observability.head_sampling_rate,
			fromConfig: configHasObservability,
		};
	}

	if (previewResource.logpush !== undefined) {
		result.logpush = {
			value: previewResource.logpush,
			fromConfig: configHasLogpush,
		};
	}

	if (
		previewResource.tail_consumers &&
		previewResource.tail_consumers.length > 0
	) {
		result.tail_consumers = previewResource.tail_consumers;
	}

	return result;
}

function buildMergedVersionLevel(
	config: Config,
	deployment: DeploymentResource
): MergedVersionLevel {
	const previews = config.previews as PreviewsConfig | undefined;
	const configBindingNames = new Set(
		Object.keys(extractConfigBindings(config))
	);
	const result: MergedVersionLevel = { env: {} };

	if (deployment.compatibility_date) {
		result.compatibility_date = {
			value: deployment.compatibility_date,
			fromConfig: !!config.compatibility_date,
		};
	}
	if (
		deployment.compatibility_flags &&
		deployment.compatibility_flags.length > 0
	) {
		result.compatibility_flags = {
			value: deployment.compatibility_flags,
			fromConfig: !!(
				config.compatibility_flags && config.compatibility_flags.length > 0
			),
		};
	}
	if (
		deployment.limits?.cpu_ms !== undefined ||
		deployment.limits?.subrequests !== undefined
	) {
		result.limits = {
			value: {
				...(deployment.limits?.cpu_ms !== undefined && {
					cpu_ms: deployment.limits.cpu_ms,
				}),
				...(deployment.limits?.subrequests !== undefined && {
					subrequests: deployment.limits.subrequests,
				}),
			},
			fromConfig: !!(
				previews?.limits !== undefined || config.limits !== undefined
			),
		};
	}
	if (deployment.placement?.mode) {
		result.placement = {
			value: { mode: deployment.placement.mode },
			fromConfig: !!config.placement?.mode,
		};
	}
	if (deployment.cache !== undefined) {
		result.cache = {
			value: deployment.cache,
			fromConfig: previews?.cache !== undefined || config.cache !== undefined,
		};
	}
	if (config.assets) {
		result.assets = {
			value: {
				directory: config.assets.directory,
				binding: config.assets.binding,
				html_handling: config.assets.html_handling,
				not_found_handling: config.assets.not_found_handling,
				run_worker_first: config.assets.run_worker_first,
			},
			fromConfig: true,
		};
	}
	for (const [name, binding] of Object.entries(deployment.env ?? {})) {
		result.env[name] = { ...binding, fromConfig: configBindingNames.has(name) };
	}

	return result;
}

function formatPreviewResource(
	previewResource: PreviewResource,
	scriptLevel: MergedScriptLevel,
	isNew: boolean,
	configName: string
): string {
	const statusLabel = isNew ? chalk.green("(new)") : chalk.dim("(updated)");
	const obsEnabled = scriptLevel.observability?.enabled ?? false;
	const obsRate = scriptLevel.observability?.head_sampling_rate;
	const formattedRate = obsRate !== undefined ? obsRate.toFixed(1) : undefined;
	const obsValue = obsEnabled
		? `enabled${
				formattedRate !== undefined ? `, ${formattedRate} sampling` : ""
			}`
		: "disabled";

	const lines: string[] = [
		`${chalk.bold("Preview:")} ${previewResource.name} ${statusLabel}`,
		"",
		...(previewResource.urls ?? []).map(
			(url) => `  ${chalk.bold.underline(url)}`
		),
	];

	const settingsRows: Array<[string, string, boolean]> = [];
	if (scriptLevel.observability !== undefined) {
		settingsRows.push([
			"observability",
			obsValue,
			scriptLevel.observability.fromConfig,
		]);
	}
	if (scriptLevel.logpush !== undefined) {
		settingsRows.push([
			"logpush",
			scriptLevel.logpush.value ? "enabled" : "disabled",
			scriptLevel.logpush.fromConfig,
		]);
	}
	if (scriptLevel.tail_consumers && scriptLevel.tail_consumers.length > 0) {
		settingsRows.push([
			"tail_consumers",
			scriptLevel.tail_consumers.map((tc) => tc.name).join(", "),
			false,
		]);
	}
	if (settingsRows.length > 0) {
		lines.push("");
		lines.push(...formatAlignedRows(settingsRows));
	}

	const hasConfigValues = settingsRows.some(([, , fromConfig]) => fromConfig);
	const footerLines = hasConfigValues
		? ["", chalk.hex("#FFA500")(`◆ from ${configName}`)]
		: undefined;

	return drawBox(lines, { footerLines, connectToChild: true });
}

function formatDeploymentResource(
	deployment: DeploymentResource,
	versionLevel: MergedVersionLevel,
	configName: string
): string {
	const lines: string[] = [
		`${chalk.bold("Deployment:")} ${deployment.id}`,
		"",
		...(deployment.urls ?? []).map((url) => `  ${chalk.bold.underline(url)}`),
	];

	const settingsRows: Array<[string, string, boolean]> = [];
	if (versionLevel.compatibility_date) {
		settingsRows.push([
			"compatibility_date",
			versionLevel.compatibility_date.value,
			versionLevel.compatibility_date.fromConfig,
		]);
	}
	if (versionLevel.compatibility_flags) {
		settingsRows.push([
			"compatibility_flags",
			versionLevel.compatibility_flags.value.join(", "),
			versionLevel.compatibility_flags.fromConfig,
		]);
	}
	if (
		versionLevel.limits?.value?.cpu_ms !== undefined ||
		versionLevel.limits?.value?.subrequests !== undefined
	) {
		const limitParts = [
			versionLevel.limits?.value?.cpu_ms !== undefined
				? `cpu_ms: ${versionLevel.limits.value.cpu_ms}`
				: undefined,
			versionLevel.limits?.value?.subrequests !== undefined
				? `subrequests: ${versionLevel.limits.value.subrequests}`
				: undefined,
		].filter((value): value is string => value !== undefined);
		settingsRows.push([
			"limits",
			limitParts.join(", "),
			versionLevel.limits.fromConfig,
		]);
	}
	if (versionLevel.placement) {
		settingsRows.push([
			"placement",
			versionLevel.placement.value.mode,
			versionLevel.placement.fromConfig,
		]);
	}
	if (versionLevel.cache !== undefined) {
		settingsRows.push([
			"cache",
			versionLevel.cache.value?.enabled ? "enabled" : "disabled",
			versionLevel.cache.fromConfig,
		]);
	}
	if (settingsRows.length > 0) {
		lines.push("");
		lines.push(...formatAlignedRows(settingsRows));
	}

	if (versionLevel.assets) {
		lines.push("");
		lines.push(chalk.bold("  Assets"));
		const assetsRows: Array<[string, string, boolean]> = [];
		const assets = versionLevel.assets.value;
		const fromConfig = versionLevel.assets.fromConfig;
		if (assets.directory) {
			assetsRows.push(["directory", assets.directory, fromConfig]);
		}
		if (assets.binding) {
			assetsRows.push(["binding", assets.binding, fromConfig]);
		}
		if (assets.html_handling) {
			assetsRows.push(["html_handling", assets.html_handling, fromConfig]);
		}
		if (assets.not_found_handling) {
			assetsRows.push([
				"not_found_handling",
				assets.not_found_handling,
				fromConfig,
			]);
		}
		if (assets.run_worker_first !== undefined) {
			const value =
				typeof assets.run_worker_first === "boolean"
					? String(assets.run_worker_first)
					: assets.run_worker_first.join(", ");
			assetsRows.push(["run_worker_first", value, fromConfig]);
		}
		lines.push(...formatAlignedRows(assetsRows, "  "));
	}

	lines.push("");
	lines.push(chalk.bold("  Bindings"));
	lines.push(...formatBindings(versionLevel.env));

	const hasConfigValues =
		settingsRows.some(([, , fromConfig]) => fromConfig) ||
		versionLevel.assets?.fromConfig ||
		Object.values(versionLevel.env).some((binding) => binding.fromConfig);
	const footerLines = hasConfigValues
		? ["", chalk.hex("#FFA500")(`◆ from ${configName}`)]
		: undefined;

	return drawConnectedChildBox(lines, { footerLines, indent: "  " });
}

function logMissingPreviewsBindingsWarning(
	topLevelBindings: Record<string, { type: string }>,
	remotePreviewDefaultBindings: Record<string, Binding> | undefined,
	localPreviewBindings: Record<string, Binding>
) {
	const availableBindingNames = new Set([
		...Object.keys(remotePreviewDefaultBindings ?? {}),
		...Object.keys(localPreviewBindings),
	]);
	const missingBindings = Object.fromEntries(
		Object.entries(topLevelBindings).filter(
			([name]) => !availableBindingNames.has(name)
		)
	);

	if (Object.keys(missingBindings).length === 0) {
		return;
	}

	logger.warn(`Your configuration has diverged.
The following bindings are configured at the top level of your Wrangler config file, but are missing from the Previews settings of your Worker.

${Object.entries(missingBindings)
	.map(
		([name, binding]) =>
			`  ${chalk.cyan(name)}  ${chalk.dim(getBindingTypeFriendlyName(binding.type as Parameters<typeof getBindingTypeFriendlyName>[0]))}`
	)
	.join("\n")}

Either include these bindings in the ${chalk.cyan(`"previews"`)} field of your Wrangler config or update the Previews settings of your Worker in the Cloudflare dashboard.`);
}

/**
 * Full preview create/update + deployment orchestration.
 * The wrangler handler calls this after auth + build.
 */
export async function preview(
	accountId: string,
	args: PreviewArgs,
	config: Config,
	buildResult: WorkerBuildResult,
	assetsOptions: PreviewAssetsOptions | undefined
): Promise<PreviewResult> {
	const workerName = resolveWorkerName(args, config);

	let previewName = args.name;
	if (!previewName) {
		previewName = getBranchName();
		if (!previewName) {
			throw new UserError(
				"Could not determine Preview name. No git branch detected. " +
					"Please provide a Preview name using --name <preview-name>.",
				{ telemetryMessage: "preview command missing preview name" }
			);
		}
	}

	const previewIdentifier = previewName;
	const ignoreDefaults = args.ignoreDefaults;
	const fallbackTag =
		!args.tag && shouldUseCIMetadataFallback() ? getHeadCommitRef() : undefined;
	const fallbackMessage =
		!args.message && shouldUseCIMetadataFallback()
			? getHeadCommitMessage()
			: undefined;

	let existingPreview: PreviewResource | null = null;
	try {
		existingPreview = await getPreview(
			config,
			accountId,
			workerName,
			previewIdentifier
		);
	} catch (e) {
		if (!(e instanceof Error && "code" in e && e.code === 10025)) {
			throw e;
		}
	}
	const isNewPreview = !existingPreview;

	let previewResource: PreviewResource;
	if (isNewPreview) {
		previewResource = await createPreview(
			config,
			accountId,
			workerName,
			{ name: previewName, ...assemblePreviewScriptSettings(config) },
			{ ignoreDefaults }
		);
	} else {
		const previewRequest = assemblePreviewScriptSettings(config);
		if (Object.keys(previewRequest).length > 0) {
			previewResource = await editPreview(
				config,
				accountId,
				workerName,
				previewIdentifier,
				previewRequest,
				{ ignoreDefaults }
			);
		} else {
			previewResource = existingPreview as PreviewResource;
		}
	}

	const deploymentRequest = await assemblePreviewDeploymentSettings(
		config,
		buildResult,
		accountId,
		workerName,
		previewResource.id,
		{
			message: args.message ?? fallbackMessage,
			tag: args.tag ?? fallbackTag,
			assetsOptions,
		}
	);
	const deployment = await createPreviewDeployment(
		config,
		accountId,
		workerName,
		previewResource.id,
		deploymentRequest,
		{ ignoreDefaults }
	);

	if (args.json) {
		logger.log(
			JSON.stringify({ preview: previewResource, deployment }, null, 2)
		);
	} else {
		const scriptLevel = buildMergedScriptLevel(config, previewResource);
		const versionLevel = buildMergedVersionLevel(config, deployment);
		const configName = configFileName(config.configPath);
		logger.log(
			formatPreviewResource(
				previewResource,
				scriptLevel,
				isNewPreview,
				configName
			)
		);
		logger.log(formatDeploymentResource(deployment, versionLevel, configName));

		const topLevelBindings = getBindings(config);
		if (Object.keys(topLevelBindings).length > 0) {
			const previewDefaults = await getWorkerPreviewDefaults(
				config,
				accountId,
				workerName
			);
			logMissingPreviewsBindingsWarning(
				topLevelBindings,
				previewDefaults.env,
				extractConfigBindings(config)
			);
		}
	}

	return { preview: previewResource, deployment, isNewPreview };
}

/**
 * Delete a preview and all its deployments.
 */
export async function previewDelete(
	accountId: string,
	args: PreviewDeleteArgs,
	config: Config
): Promise<void> {
	const workerName = resolveWorkerName(args, config);
	let previewName = args.name;
	if (!previewName) {
		previewName = getBranchName();
		if (!previewName) {
			throw new UserError(
				"Could not determine Preview name. No git branch detected. " +
					"Please provide a Preview name using --name <preview-name>.",
				{ telemetryMessage: "preview delete command missing preview name" }
			);
		}
		logger.log(`Using git branch "${previewName}" as Preview name.`);
	}

	if (!args.skipConfirmation) {
		const confirmed = await confirm(
			`Are you sure you want to delete the Preview "${previewName}" for Worker "${workerName}"?\n` +
				`This will delete all deployments associated with this Preview.`
		);
		if (!confirmed) {
			logger.log("Aborted.");
			return;
		}
	}

	await deletePreview(config, accountId, workerName, previewName);
	logger.log(`\n✨ Preview "${previewName}" deleted successfully.`);
}
