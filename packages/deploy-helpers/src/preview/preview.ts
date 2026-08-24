import path from "node:path";
import { verifyDockerInstalled } from "@cloudflare/containers-shared";
import {
	configFileName,
	getBindingTypeFriendlyName,
	getDockerPath,
	UserError,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import { syncAssets } from "../deploy/helpers/assets";
import { getBindings } from "../deploy/helpers/binding-utils";
import { moduleTypeMimeType } from "../deploy/helpers/create-worker-upload-form";
import { parseConfigPlacement } from "../deploy/helpers/placement";
import { isWorkerNotFoundError } from "../deploy/helpers/worker-not-found-error";
import { confirm, logger } from "../shared/context";
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
	previewContainerAppName,
	resolveWorkerName,
	shouldUseCIMetadataFallback,
} from "./shared";
import type { DeployCallbacks } from "../deploy/deploy";
import type { WorkerBuildResult } from "../shared/types";
import type {
	Binding,
	CreatePreviewDeploymentRequestParams,
	DeploymentResource,
	PreviewResource,
} from "./api";
import type { PullRequestMetadata } from "./shared";
import type { ContainerNormalizedConfig } from "@cloudflare/containers-shared";
import type {
	Config,
	ContainerApp,
	PreviewsConfig,
} from "@cloudflare/workers-utils";

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

// Building and applying a container to Cloudchamber requires wrangler-only
// dependencies (Docker, the containers API client) that deploy-helpers has
// no direct dependency on. As with `DeployCallbacks` (see ../deploy/deploy.ts),
// the wrangler-specific implementation is injected by the caller.
//
// `getNormalizedContainerOptions` validates and normalises container config
// without needing the preview deployment to exist yet, so `preview()` runs it
// before creating the deployment. A bad config or a missing Docker install
// then fails before the preview goes live, rather than leaving a preview
// running that advertises containers nothing ever built. `deployPreviewContainers`
// does need the deployment, since that's what resolves each container's DO
// namespace_id, so it still runs after.
export type PreviewCallbacks = Pick<
	DeployCallbacks,
	"getNormalizedContainerOptions"
> & {
	deployPreviewContainers:
		| ((
				scopedConfig: Config,
				normalisedContainerConfig: ContainerNormalizedConfig[],
				deployment: DeploymentResource,
				accountId: string,
				// Building and applying containers prints progress to stdout, the
				// same stream that carries the `--json` payload. Set this when
				// stdout has to stay machine readable.
				options: { quiet: boolean }
		  ) => Promise<void>)
		| undefined;
	// Confirms the API token carries the scope needed to apply containers.
	verifyContainersScope?: (scopedConfig: Config) => Promise<void>;
};

/**
 * Construct a synthetic `Config` for the preview's containers, so we can reuse
 * `getNormalizedContainerOptions` and `apply` from the standard `wrangler
 * deploy` container path without forking either. Containers come from
 * `previews.containers`, defaulting each unnamed entry to a generated
 * application name, and DO bindings come from `previews.durable_objects`.
 *
 * `observability` is carried over because a container application has its own
 * observability setting, which `getNormalizedContainerOptions` reads from the
 * config it is given. The container path does not read `logpush`, `limits`, or
 * `cache`, so overlaying those here would have no effect.
 *
 * Throws if a container names no Durable Object class, or if the class it names
 * is not one this script implements. Returns `undefined` if every container
 * resolves only to a cross-script binding, since those are owned by another
 * Worker.
 */
function buildPreviewContainerConfig(
	config: Config,
	parentWorkerName: string,
	previewSlug: string,
	previewContainers: ContainerApp[]
): Config | undefined {
	const previews = config.previews as PreviewsConfig | undefined;
	const previewDOBindings = previews?.durable_objects?.bindings ?? [];
	const ownedDOClasses = getPreviewOwnedContainerClassNames(config, previews);

	// A preview container has to name its Durable Object class itself. The other
	// direction of the link, a Durable Object naming its container through
	// `exports[Class].container`, resolves against the top level `containers`
	// array, so it can only ever reach a container this preview does not own.
	const linkedContainers = previewContainers.map((container) => {
		const className = container.class_name;
		if (className === undefined) {
			throw new UserError(
				`A container entry in "previews.containers" is missing "class_name". A preview container must name the Durable Object class it backs, even where a Durable Object declared in "exports" names its container instead.`,
				{
					telemetryMessage: "preview container missing class_name",
				}
			);
		}
		return { container, className };
	});

	// A container whose class matches no Durable Object at all is a
	// misconfiguration, almost always a typo, and silently dropping it would
	// hand back a preview with no container and no explanation, so reject it
	// here, before the preview deployment is created.
	//
	// A class that does match a binding carrying `script_name` is excluded
	// rather than rejected: that DO is implemented by another Worker, which owns
	// its own container application.
	for (const { className } of linkedContainers) {
		if (
			ownedDOClasses.has(className) ||
			previewDOBindings.some((b) => b.class_name === className)
		) {
			continue;
		}
		throw new UserError(
			`The container class_name "${className}" in "previews.containers" does not match any Durable Object class in your ${configFileName(config.configPath)} file. Declare the class in "migrations" or "exports", or bind it under "previews.durable_objects".`,
			{
				telemetryMessage: "no preview DO class matches container class_name",
			}
		);
	}

	const filteredContainers = linkedContainers
		.filter(({ className }) => ownedDOClasses.has(className))
		.map(({ container, className }) => ({
			...container,
			name: previewContainerAppName(parentWorkerName, previewSlug, className),
		}));

	if (filteredContainers.length === 0) {
		return undefined;
	}

	// `getNormalizedContainerOptions` resolves a container's Durable Object with
	// `find()` on `class_name`, and rejects the container outright if that first
	// match carries `script_name`. A class bound both locally and cross-script
	// would then fail as though another Worker owned it, purely because of
	// binding order. Put the locally implemented bindings first so the lookup
	// lands on the one this preview owns.
	const localBindingsFirst = [
		...previewDOBindings.filter((b) => b.script_name === undefined),
		...previewDOBindings.filter((b) => b.script_name !== undefined),
	];

	const observability = previews?.observability ?? config.observability;
	return {
		...config,
		containers: filteredContainers,
		durable_objects: {
			bindings: localBindingsFirst,
		},
		observability,
	};
}

/**
 * Validate and normalise container config, and confirm Docker is installed
 * for any container built from a Dockerfile. Called before the preview
 * deployment is created, so a bad config or a missing Docker install fails
 * before the preview goes live, rather than leaving a preview running that
 * advertises containers nothing ever built.
 *
 * Returns an empty `normalisedContainerConfig` when there's nothing to
 * deploy, whether because `previews.containers` is empty or every entry
 * resolves to a cross-script DO binding owned by another Worker. Throws if an
 * entry's `class_name` matches no DO binding in `previews.durable_objects`.
 */
async function prepareContainersForPreview(
	config: Config,
	workerName: string,
	previewSlug: string,
	callbacks: PreviewCallbacks
): Promise<{
	scopedContainerConfig: Config | undefined;
	normalisedContainerConfig: ContainerNormalizedConfig[];
}> {
	const previewContainers =
		(config.previews as PreviewsConfig | undefined)?.containers ?? [];
	if (
		previewContainers.length === 0 ||
		!callbacks.getNormalizedContainerOptions
	) {
		return { scopedContainerConfig: undefined, normalisedContainerConfig: [] };
	}

	const scopedContainerConfig = buildPreviewContainerConfig(
		config,
		workerName,
		previewSlug,
		previewContainers
	);
	if (!scopedContainerConfig) {
		return { scopedContainerConfig: undefined, normalisedContainerConfig: [] };
	}

	const normalisedContainerConfig =
		await callbacks.getNormalizedContainerOptions(scopedContainerConfig, {
			dryRun: false,
		});

	const containersNeedingDocker = normalisedContainerConfig.filter(
		(container) => "dockerfile" in container
	);
	if (containersNeedingDocker.length > 0) {
		await verifyDockerInstalled({
			dockerPath: getDockerPath(),
			operation: "creating a preview",
			imageNoun:
				containersNeedingDocker.length !== 1
					? "the configured images"
					: "the configured image",
			hint: 'If you cannot run Docker locally, set "image" to a prebuilt registry image instead of a Dockerfile path for the affected entries in "previews.containers".',
		});
	}

	// Applying containers checks the token's scope as well, but only after the
	// deployment exists. Checking it here stops a badly scoped token from
	// leaving a live preview that advertises containers nothing ever built.
	if (callbacks.verifyContainersScope) {
		await callbacks.verifyContainersScope(scopedContainerConfig);
	}

	return { scopedContainerConfig, normalisedContainerConfig };
}

export const NO_ACTIVE_PREVIEW_URLS_MESSAGE =
	"Note: This Preview deployment has no active URLs. To get one, enable Preview Deployments on workers.dev or a custom domain. See https://developers.cloudflare.com/workers/previews/custom-domains/ for more information";

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

	const { scopedContainerConfig, normalisedContainerConfig } =
		await prepareContainersForPreview(
			config,
			workerName,
			previewResource.slug,
			callbacks
		);

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

	if (
		normalisedContainerConfig.length > 0 &&
		scopedContainerConfig &&
		callbacks.deployPreviewContainers
	) {
		try {
			await callbacks.deployPreviewContainers(
				scopedContainerConfig,
				normalisedContainerConfig,
				deployment,
				accountId,
				{ quiet: args.json === true }
			);
		} catch (error) {
			// The deployment is live by this point, so say so before the build or
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
