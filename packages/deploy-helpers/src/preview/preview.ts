import path from "node:path";
import { getLogLevel, setLogLevel } from "@cloudflare/cli-shared-helpers";
import {
	apply,
	initContainersSharedContext,
	listDurableObjects,
	pushBuiltContainerImage,
} from "@cloudflare/containers-shared";
import {
	configFileName,
	getBindings,
	getBindingTypeFriendlyName,
	getDockerPath,
	UserError,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import { syncAssets } from "../deploy/helpers/assets";
import { moduleTypeMimeType } from "../deploy/helpers/create-worker-upload-form";
import { parseConfigPlacement } from "../deploy/helpers/placement";
import { isWorkerNotFoundError } from "../deploy/helpers/worker-not-found-error";
import { confirm, fetchResult, logger } from "../shared/context";
import { getSubdomainValues } from "../triggers/deploy";
import {
	createPreview,
	createPreviewDeployment,
	createPreviewParentWorker,
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
	getCommitSha,
	getHeadCommitMessage,
	getHeadCommitRef,
	getPreviewOwnedContainerClassNames,
	getPullRequestMetadata,
	getRepositoryUrl,
	resolveWorkerName,
	shouldUseCIMetadataFallback,
} from "./shared";
import type { WorkerBuildResult } from "../shared/types";
import type {
	Binding,
	CreatePreviewDeploymentRequestParams,
	DeploymentResource,
	PreviewDeploymentModule,
	PreviewResource,
} from "./api";
import type { PullRequestMetadata } from "./shared";
import type {
	BuiltContainerDeployment,
	ContainerNormalizedConfig,
	DurableObjectNamespace,
} from "@cloudflare/containers-shared";
import type { Config, Logger, PreviewsConfig } from "@cloudflare/workers-utils";

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

export type PreviewContainerPreparation = {
	scopedContainerConfig: Config | undefined;
	normalisedContainerConfig: ContainerNormalizedConfig[];
	builtContainerDeployments: BuiltContainerDeployment[];
};

// Building and applying a container to Cloudchamber requires wrangler-only
// dependencies (Docker, the containers API client) that deploy-helpers has no
// direct dependency on. As with `DeployCallbacks` (see ../deploy/deploy.ts),
// the wrangler-specific preparation implementation is injected by the caller.
export type PreviewCallbacks = {
	preparePreviewContainers:
		| ((
				config: Config,
				workerName: string,
				previewSlug: string,
				options: { quiet: boolean }
		  ) => Promise<PreviewContainerPreparation>)
		| undefined;
};

export const NO_ACTIVE_PREVIEW_URLS_MESSAGE =
	"Note: This Preview deployment has no active URLs. To get one, enable Preview Deployments on workers.dev or a custom domain. See https://developers.cloudflare.com/workers/previews/custom-domains/ for more information";

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
			content: buildResult.content,
		},
		...buildResult.modules.map((mod) => {
			const contentType =
				moduleTypeMimeType[mod.type ?? "text"] ?? "application/octet-stream";
			return {
				name: mod.name,
				content_type: contentType,
				content: mod.content,
			};
		}),
	];

	if (buildResult.sourceMaps) {
		deploymentModules.push(
			...buildResult.sourceMaps.map((sourceMap) => ({
				name: sourceMap.name,
				content_type: "application/source-map",
				content: sourceMap.content,
			}))
		);
	}

	if (assetFiles?._headers !== undefined) {
		deploymentModules.push({
			name: "_headers",
			content_type: "text/plain",
			content: assetFiles._headers,
		});
	}

	if (assetFiles?._redirects !== undefined) {
		deploymentModules.push({
			name: "_redirects",
			content_type: "text/plain",
			content: assetFiles._redirects,
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
		repositoryUrl?: string;
		pullRequest?: PullRequestMetadata;
		commitSha?: string;
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
	const repositoryUrl = options.repositoryUrl;
	const pullRequest = options.pullRequest;
	const commitSha = options.commitSha;
	if (
		options.message ||
		options.tag ||
		repositoryUrl ||
		pullRequest ||
		commitSha
	) {
		request.annotations = {
			...(commitSha && { "workers/commit_sha": commitSha }),
			...(options.message && { "workers/message": options.message }),
			...(pullRequest?.number && {
				"workers/pull_request_number": pullRequest.number,
			}),
			...(pullRequest?.title && {
				"workers/pull_request_title": pullRequest.title,
			}),
			...(pullRequest?.url && { "workers/pull_request_url": pullRequest.url }),
			...(repositoryUrl && { "workers/repository_url": repositoryUrl }),
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

	// Declare which DO classes are container-backed so the runtime populates
	// `ctx.container` on those DO instances, mirroring the metadata emitted by
	// `wrangler deploy`.
	//
	// Container config is non-inheritable. Only `previews.containers` is read,
	// not the top-level `containers` field. This matches the behavior of
	// `previews.durable_objects` and forces users to explicitly opt-in to
	// containers in previews.
	//
	// We only emit `class_name`s where the DO is implemented by THIS script,
	// whether it is declared through `migrations`, through `exports`, or bound
	// under `previews.durable_objects` without a `script_name`. A binding
	// carrying `script_name` references a DO implemented by another worker,
	// which owns its own container application.
	//
	// A container that names no class is rejected by
	// `buildPreviewContainerConfig` before we get here, so it is dropped rather
	// than reported again.
	const previewContainers = previews?.containers ?? [];
	if (previewContainers.length > 0) {
		const ownedDOClasses = getPreviewOwnedContainerClassNames(config, previews);
		const containers = previewContainers.flatMap(({ class_name }) =>
			class_name !== undefined && ownedDOClasses.has(class_name)
				? [{ class_name }]
				: []
		);
		if (containers.length > 0) {
			request.containers = containers;
		}
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
	isNew: boolean,
	pullRequest?: PullRequestMetadata
): string {
	const statusLabel = isNew ? chalk.green("(new)") : chalk.dim("(updated)");
	const pullRequestUrl =
		deployment.annotations?.["workers/pull_request_url"] ?? pullRequest?.url;
	const pullRequestNumber =
		deployment.annotations?.["workers/pull_request_number"] ??
		pullRequest?.number;
	const hasActiveUrls =
		(previewResource.urls?.length ?? 0) > 0 ||
		(deployment.urls?.length ?? 0) > 0;

	return [
		`${chalk.bold("Preview:")} ${previewResource.name} ${statusLabel}`,
		...formatUrlLines("Preview", previewResource.urls),
		"",
		`${chalk.bold("Deployment ID:")} ${deployment.id}`,
		...formatUrlLines("Deployment", deployment.urls),
		...(pullRequestUrl || pullRequestNumber
			? [
					`${chalk.bold("Pull Request:")} ${
						pullRequestUrl ?? `#${pullRequestNumber}`
					}`,
				]
			: []),
		...(hasActiveUrls ? [] : [NO_ACTIVE_PREVIEW_URLS_MESSAGE]),
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
 * Creates the parent Worker required for a Preview, prompting when interactive.
 *
 * @param config The resolved Wrangler config.
 * @param accountId The Cloudflare account ID.
 * @param workerName The parent Worker name.
 * @param json Whether to suppress human-readable output.
 * @returns A promise that resolves when the parent Worker has been created.
 */
async function provisionParentWorker(
	config: Config,
	accountId: string,
	workerName: string,
	json: boolean
): Promise<void> {
	const confirmed =
		json ||
		(await confirm(
			`Worker "${workerName}" does not exist yet. Would you like to create it for this Preview?`,
			// Default to true so CI and Workers Builds can create Previews unattended.
			{ defaultValue: true, fallbackValue: true }
		));
	if (!confirmed) {
		throw new UserError(
			`Cannot create a Preview because the Worker "${workerName}" does not exist.`,
			{ telemetryMessage: "preview command parent worker not created" }
		);
	}

	if (!json) {
		logger.log(`🌀 Creating new Worker "${workerName}"...`);
	}
	const routes = config.routes ?? (config.route ? [config.route] : []);
	const { workers_dev, preview_urls } = getSubdomainValues(
		config.workers_dev,
		config.preview_urls,
		routes
	);
	await createPreviewParentWorker(
		config,
		accountId,
		workerName,
		workers_dev,
		preview_urls ?? workers_dev
	);
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
	assetsOptions: PreviewAssetsOptions | undefined,
	callbacks: PreviewCallbacks
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
	const repositoryUrl = getRepositoryUrl();
	const pullRequest = getPullRequestMetadata();
	const commitSha = getCommitSha();

	let existingPreview: PreviewResource | null = null;
	try {
		existingPreview = await getPreview(
			config,
			accountId,
			workerName,
			previewIdentifier
		);
	} catch (e) {
		if (isWorkerNotFoundError(e)) {
			await provisionParentWorker(
				config,
				accountId,
				workerName,
				args.json ?? false
			);
		} else if (!(e instanceof Error && "code" in e && e.code === 10025)) {
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

	const {
		scopedContainerConfig,
		normalisedContainerConfig,
		builtContainerDeployments,
	} = callbacks.preparePreviewContainers
		? await callbacks.preparePreviewContainers(
				config,
				workerName,
				previewResource.slug,
				{ quiet: args.json === true }
			)
		: {
				scopedContainerConfig: undefined,
				normalisedContainerConfig: [],
				builtContainerDeployments: [],
			};

	const deploymentRequest = await assemblePreviewDeploymentSettings(
		config,
		buildResult,
		accountId,
		workerName,
		previewResource.id,
		{
			message: args.message ?? fallbackMessage,
			tag: args.tag ?? fallbackTag,
			repositoryUrl,
			pullRequest,
			commitSha,
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

	if (normalisedContainerConfig.length > 0 && scopedContainerConfig) {
		try {
			await deployPreviewContainers(
				scopedContainerConfig,
				normalisedContainerConfig,
				builtContainerDeployments,
				deployment,
				accountId,
				{ quiet: args.json === true }
			);
		} catch (error) {
			// The deployment is live by this point, so say so before the push or
			// apply error surfaces on its own. Written to stderr so it cannot
			// corrupt a `--json` payload.
			logger.warn(
				`The preview "${previewResource.name}" was created, but its containers did not come up. Its Durable Objects have no container backing them until the containers are applied successfully.`
			);
			throw error;
		}
	}

	if (args.json) {
		logger.log(
			JSON.stringify({ preview: previewResource, deployment }, null, 2)
		);
	} else {
		logger.log(
			formatPreviewDeploymentSummary(
				previewResource,
				deployment,
				isNewPreview,
				pullRequest
			)
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
 * Resolve each normalised preview container's Durable Object namespace, then
 * push and apply its Cloudchamber application.
 *
 * The DO namespace for a preview is provisioned by the workers control plane.
 * For a bound Durable Object it comes back in the create-deployment response,
 * so we read it from `deployment.env` rather than re-fetching. A Durable Object
 * reached only through `ctx.exports` has no binding to carry it, so those fall
 * back to the namespaces list API.
 */
async function deployPreviewContainers(
	scopedConfig: Config,
	normalisedContainerConfig: ContainerNormalizedConfig[],
	builtContainerDeployments: BuiltContainerDeployment[],
	deployment: DeploymentResource,
	accountId: string,
	options: { quiet: boolean }
): Promise<void> {
	await runPreviewContainerOperation(options, async () => {
		const dockerPath = getDockerPath();
		const classNameToNamespaceId = new Map<string, string>();

		// Skip bindings carrying `script_name`. Those name a Durable Object
		// implemented by another Worker, which owns its own container application,
		// so their namespace belongs to that Worker. A preview may bind the same
		// class name both locally and cross-script, and since this map is keyed on
		// class name alone, an unfiltered cross-script entry could overwrite the
		// preview's own namespace_id and attach the container to the wrong storage.
		// `wrangler deploy` applies the same restriction.
		for (const binding of Object.values(deployment.env ?? {})) {
			if (
				binding.type === "durable_object_namespace" &&
				binding.class_name &&
				binding.namespace_id &&
				binding.script_name === undefined
			) {
				classNameToNamespaceId.set(binding.class_name, binding.namespace_id);
			}
		}

		// Only bound Durable Objects appear in `deployment.env`. A class reached
		// solely through `ctx.exports` still has a namespace provisioned for the
		// preview, so fall back to the namespaces list and match on it, the same way
		// `wrangler deploy` resolves an unbound Durable Object.
		let allNamespaces: DurableObjectNamespace[] | undefined;

		for (const container of normalisedContainerConfig) {
			let namespaceId = classNameToNamespaceId.get(container.class_name);
			if (!namespaceId) {
				allNamespaces ??= await listDurableObjects(scopedConfig, accountId);
				// `script` is the parent Worker's name for every one of its previews,
				// so match on the preview id to avoid attaching this container to the
				// parent's namespace or to another preview's.
				namespaceId = allNamespaces.find(
					(namespace) =>
						namespace.class === container.class_name &&
						namespace.preview?.id === deployment.preview_id
				)?.id;
			}
			if (!namespaceId) {
				throw new UserError(
					`Could not deploy preview container application "${container.name}": no Durable Object namespace was found for class "${container.class_name}" in preview "${deployment.preview_name}". This is likely a bug in Wrangler. Please file an issue.`,
					{
						telemetryMessage:
							"preview containers deploy missing do namespace id",
					}
				);
			}

			const imageRef =
				"dockerfile" in container
					? await pushBuiltPreviewContainerImage({
							container,
							builtContainerDeployments,
							deployment,
							dockerPath,
							accountId,
							scopedConfig,
						})
					: { newTag: container.image_uri };

			await apply(
				{ imageRef, durable_object_namespace_id: namespaceId },
				container,
				scopedConfig,
				accountId
			);
		}
	});
}

async function pushBuiltPreviewContainerImage({
	container,
	builtContainerDeployments,
	deployment,
	dockerPath,
	accountId,
	scopedConfig,
}: {
	container: ContainerNormalizedConfig;
	builtContainerDeployments: BuiltContainerDeployment[];
	deployment: DeploymentResource;
	dockerPath: string;
	accountId: string;
	scopedConfig: Config;
}) {
	const builtContainerDeployment = builtContainerDeployments.find(
		(deployment) => deployment.container === container
	);
	if (!builtContainerDeployment) {
		throw new UserError(
			`Could not deploy preview container application "${container.name}": no built image was found for class "${container.class_name}". This is likely a bug in Wrangler. Please file an issue.`,
			{
				telemetryMessage: "preview containers deploy missing built image",
			}
		);
	}

	return await pushBuiltContainerImage(
		builtContainerDeployment.builtImage,
		deployment.id,
		dockerPath,
		accountId,
		scopedConfig
	);
}

async function runPreviewContainerOperation<T>(
	options: { quiet: boolean },
	operation: () => Promise<T>
): Promise<T> {
	initContainersSharedContext({
		logger: options.quiet ? quietLogger : logger,
		fetchResult,
	});

	if (!options.quiet) {
		return operation();
	}

	// Building and applying containers prints progress to stdout, the same stream
	// that carries the `--json` payload. Keep both logging surfaces quiet while
	// stdout has to stay machine-readable.
	const previousLogLevel = getLogLevel();
	setLogLevel("error");
	try {
		return await operation();
	} finally {
		setLogLevel(previousLogLevel);
		initContainersSharedContext({ logger, fetchResult });
	}
}

const quietLogger: Logger = {
	debug() {},
	log() {},
	info() {},
	warn: (...args: unknown[]) => logger.warn(...args),
	error: (...args: unknown[]) => logger.error(...args),
};

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
