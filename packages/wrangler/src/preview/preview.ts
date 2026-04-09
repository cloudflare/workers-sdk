import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	configFileName,
	getBindingTypeFriendlyName,
	UserError,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import { getAssetsOptions, syncAssets } from "../assets";
import { getBindings } from "../deployment-bundle/bindings";
import { bundleWorker } from "../deployment-bundle/bundle";
import { moduleTypeMimeType } from "../deployment-bundle/create-worker-upload-form";
import { getEntry } from "../deployment-bundle/entry";
import { logBuildOutput } from "../deployment-bundle/esbuild-plugins/log-build-output";
import {
	createModuleCollector,
	getWrangler1xLegacyModuleReferences,
} from "../deployment-bundle/module-collection";
import { noBundleWorker } from "../deployment-bundle/no-bundle-worker";
import { validateNodeCompatMode } from "../deployment-bundle/node-compat";
import { loadSourceMaps } from "../deployment-bundle/source-maps";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { isNavigatorDefined } from "../navigator-user-agent";
import { requireAuth } from "../user";
import {
	drawBox,
	drawConnectedChildBox,
	padToVisibleWidth,
	visibleLength,
} from "../utils/box";
import { getRules } from "../utils/getRules";
import { parseConfigPlacement } from "../utils/placement";
import {
	createPreview,
	createPreviewDeployment,
	deletePreview,
	editPreview,
	getPreviewDeployment,
	getPreview,
	getWorkerPreviewDefaults,
} from "./api";
import {
	assemblePreviewScriptSettings,
	extractConfigBindings,
	getBindingValue,
	getBranchName,
	getHeadCommitMessage,
	getHeadCommitRef,
	resolveWorkerName,
	shouldUseCIMetadataFallback,
} from "./shared";
import type { StartDevWorkerInput } from "../api/startDevWorker/types";
import type {
	Binding,
	CreatePreviewDeploymentRequestParams,
	DeploymentResource,
	PreviewResource,
} from "./api";
import type {
	CfModule,
	Config,
	PreviewsConfig,
} from "@cloudflare/workers-utils";

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

async function getDeploymentModules(
	config: Config,
	scriptPath: string | undefined,
	assetFiles?: { _headers?: string; _redirects?: string }
): Promise<{ main_module: string; modules: PreviewDeploymentModule[] }> {
	const entry = await getEntry({ script: scriptPath }, config, "deploy");
	const entryDirectory = path.dirname(entry.file);
	const moduleCollector = createModuleCollector({
		wrangler1xLegacyModuleReferences: getWrangler1xLegacyModuleReferences(
			entryDirectory,
			entry.file
		),
		entry,
		findAdditionalModules: config.find_additional_modules ?? false,
		rules: getRules(config),
		preserveFileNames: config.preserve_file_names ?? false,
	});

	const compatibilityDate = config.compatibility_date;
	const compatibilityFlags = config.compatibility_flags;
	const nodejsCompatMode = validateNodeCompatMode(
		compatibilityDate,
		compatibilityFlags,
		{ noBundle: config.no_bundle }
	);

	const destination = path.join(tmpdir(), `wrangler-preview-${Date.now()}`);
	const bundleResult = config.no_bundle
		? await noBundleWorker(
				entry,
				getRules(config),
				destination,
				config.python_modules.exclude
			)
		: await bundleWorker(entry, destination, {
				bundle: true,
				additionalModules: [],
				moduleCollector,
				doBindings: config.previews?.durable_objects?.bindings ?? [],
				workflowBindings: config.previews?.workflows ?? [],
				jsxFactory: config.jsx_factory,
				jsxFragment: config.jsx_fragment,
				tsconfig: config.tsconfig,
				minify: config.minify,
				keepNames: config.keep_names ?? true,
				sourcemap: config.upload_source_maps ?? false,
				nodejsCompatMode,
				compatibilityDate,
				compatibilityFlags,
				alias: config.alias,
				define: config.previews?.define ?? {},
				checkFetch: false,
				targetConsumer: "deploy",
				watch: undefined,
				testScheduled: undefined,
				inject: undefined,
				plugins: [logBuildOutput(nodejsCompatMode)],
				isOutfile: undefined,
				local: false,
				projectRoot:
					config.userConfigPath !== undefined
						? path.dirname(config.userConfigPath)
						: undefined,
				defineNavigatorUserAgent: isNavigatorDefined(
					compatibilityDate,
					compatibilityFlags
				),
				external: undefined,
				entryName: undefined,
				metafile: undefined,
			});
	const { modules, resolvedEntryPointPath, bundleType } = bundleResult;

	const mainModuleName = path.basename(resolvedEntryPointPath);
	const mainModuleContent = readFileSync(resolvedEntryPointPath, "utf-8");
	const mainModule: CfModule = {
		name: mainModuleName,
		filePath: resolvedEntryPointPath,
		content: mainModuleContent,
		type: bundleType,
	};
	const mainContentType =
		moduleTypeMimeType[bundleType] ?? "application/octet-stream";
	const deploymentModules: PreviewDeploymentModule[] = [
		{
			name: mainModule.name,
			content_type: mainContentType,
			content_base64: toBase64(mainModule.content),
		},
		...modules.map((mod) => {
			const contentType =
				moduleTypeMimeType[mod.type ?? "text"] ?? "application/octet-stream";
			return {
				name: mod.name,
				content_type: contentType,
				content_base64: toBase64(mod.content),
			};
		}),
	];

	if (config.upload_source_maps) {
		deploymentModules.push(
			...loadSourceMaps(mainModule, modules, bundleResult).map((sourceMap) => ({
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
	scriptPath: string | undefined,
	accountId: string,
	workerName: string,
	previewIdentifier: string,
	options: { message?: string; tag?: string }
): Promise<CreatePreviewDeploymentRequestParams> {
	const previews = config.previews as PreviewsConfig | undefined;
	const request: CreatePreviewDeploymentRequestParams = {};
	const assetsOptions = getAssetsOptions(
		{ assets: undefined, script: scriptPath },
		config
	);
	const deploymentModules = await getDeploymentModules(config, scriptPath, {
		_headers: assetsOptions?._headers,
		_redirects: assetsOptions?._redirects,
	});
	request.main_module = deploymentModules.main_module;
	request.modules = deploymentModules.modules;

	if (assetsOptions) {
		const assetsJwt = await syncAssets(
			config,
			accountId,
			assetsOptions.directory,
			workerName
		);
		request.assets = {
			jwt: assetsJwt,
			config: {
				html_handling: assetsOptions.assetConfig.html_handling,
				not_found_handling: assetsOptions.assetConfig.not_found_handling,
				run_worker_first: assetsOptions.run_worker_first,
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
	preview: PreviewResource
): MergedScriptLevel {
	const previews = config.previews as PreviewsConfig | undefined;
	const result: MergedScriptLevel = {};
	const configHasObservability =
		previews?.observability !== undefined || config.observability !== undefined;
	const configHasLogpush =
		previews?.logpush !== undefined || config.logpush !== undefined;

	if (preview.observability !== undefined) {
		result.observability = {
			enabled: preview.observability.enabled,
			head_sampling_rate: preview.observability.head_sampling_rate,
			fromConfig: configHasObservability,
		};
	}

	if (preview.logpush !== undefined) {
		result.logpush = {
			value: preview.logpush,
			fromConfig: configHasLogpush,
		};
	}

	if (preview.tail_consumers && preview.tail_consumers.length > 0) {
		result.tail_consumers = preview.tail_consumers;
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

const CONFIG_MARKER = chalk.hex("#FFA500")("◆");

function getFriendlyBindingType(bindingType: string): string {
	return getBindingTypeFriendlyName(
		bindingType as Parameters<typeof getBindingTypeFriendlyName>[0]
	);
}

function formatAlignedRows(
	rows: Array<[string, string, boolean]>,
	indent: string = "  "
): string[] {
	const labelWidth = Math.max(...rows.map(([label]) => label.length));
	const valueWidth = Math.max(...rows.map(([, value]) => value.length));

	return rows.map(([label, value, fromConfig]) => {
		const marker = fromConfig ? CONFIG_MARKER : " ";
		const coloredLabel = chalk.cyan(padToVisibleWidth(label, labelWidth));
		return `${indent}${coloredLabel}   ${padToVisibleWidth(
			value,
			valueWidth
		)}  ${marker}`;
	});
}

function formatBindings(
	env: Record<string, MergedBinding>,
	indent: string = "  ",
	options: { showSourceMarker?: boolean } = {}
): string[] {
	const showSourceMarker = options.showSourceMarker ?? true;
	const entries = Object.entries(env);
	if (entries.length === 0) {
		return [`${indent}${chalk.dim("(none)")}`];
	}

	const nameWidth = Math.max(...entries.map(([name]) => name.length));
	const typeWidth = Math.max(
		...entries.map(([, binding]) =>
			visibleLength(getFriendlyBindingType(binding.type))
		)
	);
	const valueWidth = Math.max(
		...entries.map(([, binding]) => getBindingValue(binding).length)
	);

	return entries.map(([name, binding]) => {
		const value = getBindingValue(binding);
		const friendlyType = getFriendlyBindingType(binding.type);
		const coloredName = chalk.cyan(padToVisibleWidth(name, nameWidth));
		const dimType = chalk.dim(padToVisibleWidth(friendlyType, typeWidth));
		if (showSourceMarker) {
			const marker = binding.fromConfig ? CONFIG_MARKER : " ";
			return `${indent}${coloredName}   ${dimType}   ${padToVisibleWidth(
				value,
				valueWidth
			)}  ${marker}`;
		}
		return `${indent}${coloredName}   ${dimType}   ${padToVisibleWidth(
			value,
			valueWidth
		)}`;
	});
}

function formatPreviewResource(
	preview: PreviewResource,
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
		`${chalk.bold("Preview:")} ${preview.name} ${statusLabel}`,
		"",
		...(preview.urls ?? []).map((url) => `  ${chalk.bold.underline(url)}`),
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
	topLevelBindings: StartDevWorkerInput["bindings"],
	remotePreviewDefaultBindings: Record<string, Binding> | undefined,
	localPreviewBindings: Record<string, Binding>
) {
	const availableBindingNames = new Set([
		...Object.keys(remotePreviewDefaultBindings ?? {}),
		...Object.keys(localPreviewBindings),
	]);
	const missingBindings = Object.fromEntries(
		Object.entries(topLevelBindings ?? {}).filter(
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
			`  ${chalk.cyan(name)}  ${chalk.dim(getBindingTypeFriendlyName(binding.type))}`
	)
	.join("\n")}

Either include these bindings in the ${chalk.cyan(`"previews"`)} field of your Wrangler config or update the Previews settings of your Worker in the Cloudflare dashboard.`);
}

export async function handlePreviewCommand(
	args: {
		script?: string;
		name?: string;
		tag?: string;
		message?: string;
		json?: boolean;
		ignoreDefaults: boolean;
		workerName?: string;
		"worker-name"?: string;
	},
	{ config }: { config: Config }
) {
	const workerName = resolveWorkerName(args, config);

	let previewName = args.name;
	if (!previewName) {
		previewName = getBranchName();
		if (!previewName) {
			throw new UserError(
				"Could not determine Preview name. No git branch detected. " +
					"Please provide a Preview name using --name <preview-name>."
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
	const accountId = await requireAuth(config);

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

	let preview: PreviewResource;
	if (isNewPreview) {
		preview = await createPreview(
			config,
			accountId,
			workerName,
			{ name: previewName, ...assemblePreviewScriptSettings(config) },
			{ ignoreDefaults }
		);
	} else {
		const previewRequest = assemblePreviewScriptSettings(config);
		if (Object.keys(previewRequest).length > 0) {
			preview = await editPreview(
				config,
				accountId,
				workerName,
				previewIdentifier,
				previewRequest,
				{ ignoreDefaults }
			);
		} else {
			preview = existingPreview as PreviewResource;
		}
	}

	const deploymentRequest = await assemblePreviewDeploymentSettings(
		config,
		args.script,
		accountId,
		workerName,
		preview.id,
		{ message: args.message ?? fallbackMessage, tag: args.tag ?? fallbackTag }
	);
	const deployment = await createPreviewDeployment(
		config,
		accountId,
		workerName,
		preview.id,
		deploymentRequest,
		{ ignoreDefaults }
	);

	if (args.json) {
		logger.log(JSON.stringify({ preview, deployment }, null, 2));
		return;
	}

	const scriptLevel = buildMergedScriptLevel(config, preview);
	const versionLevel = buildMergedVersionLevel(config, deployment);
	const configName = configFileName(config.configPath);
	logger.log(
		formatPreviewResource(preview, scriptLevel, isNewPreview, configName)
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

export async function handlePreviewDeleteCommand(
	args: {
		name?: string;
		skipConfirmation?: boolean;
		workerName?: string;
		"worker-name"?: string;
	},
	{ config }: { config: Config }
) {
	const workerName = resolveWorkerName(args, config);
	let previewName = args.name;
	if (!previewName) {
		previewName = getBranchName();
		if (!previewName) {
			throw new UserError(
				"Could not determine Preview name. No git branch detected. " +
					"Please provide a Preview name using --name <preview-name>."
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

	const accountId = await requireAuth(config);
	await deletePreview(config, accountId, workerName, previewName);
	logger.log(`\n✨ Preview "${previewName}" deleted successfully.`);
}
