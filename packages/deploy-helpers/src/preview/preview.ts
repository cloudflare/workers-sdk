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

export type PreviewArgs = {
	script?: string;
	name?: string;
	tag?: string;
	message?: string;
	json?: boolean;
	ignoreBaseConfig: boolean;
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

function formatUrlLines(label: string, urls: string[] | undefined): string[] {
	if (urls === undefined || urls.length === 0) {
		return [];
	}

	const firstUrl = urls[0];
	if (urls.length === 1 && firstUrl !== undefined) {
		return [`${chalk.bold(`${label} URL:`)} ${chalk.underline(firstUrl)}`];
	}

	return [
		chalk.bold(`${label} URLs:`),
		...urls.map((url) => `  ${chalk.underline(url)}`),
	];
}

function formatPreviewDeploymentSummary(
	previewResource: PreviewResource,
	deployment: DeploymentResource,
	isNew: boolean
): string {
	const statusLabel = isNew ? chalk.green("(new)") : chalk.dim("(updated)");

	return [
		`${chalk.bold("Preview:")} ${previewResource.name} ${statusLabel}`,
		...formatUrlLines("Preview", previewResource.urls),
		"",
		`${chalk.bold("Deployment ID:")} ${deployment.id}`,
		...formatUrlLines("Deployment", deployment.urls),
	].join("\n");
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
	const ignoreBaseConfig = args.ignoreBaseConfig;
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
			{ ignoreBaseConfig }
		);
	} else {
		const previewRequest = assemblePreviewScriptSettings(config);
		if (Object.keys(previewRequest).length > 0) {
			previewResource = await editPreview(
				config,
				accountId,
				workerName,
				previewIdentifier,
				previewRequest
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
		deploymentRequest
	);

	if (args.json) {
		logger.log(
			JSON.stringify({ preview: previewResource, deployment }, null, 2)
		);
	} else {
		logger.log(
			formatPreviewDeploymentSummary(previewResource, deployment, isNewPreview)
		);

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
