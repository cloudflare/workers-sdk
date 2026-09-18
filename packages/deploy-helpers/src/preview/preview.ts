import path from "node:path";
import { convertToWranglerConfig } from "@cloudflare/config";
import { verifyDockerInstalled } from "@cloudflare/containers-shared";
import { maybeGetFile } from "@cloudflare/workers-shared/utils/helpers";
import {
	configFileName,
	defaultWranglerConfig,
	formatConfigSnippet,
	getBindingTypeFriendlyName,
	getDockerPath,
	UserError,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import { syncAssets } from "../deploy/helpers/assets";
import { moduleTypeMimeType } from "../deploy/helpers/create-worker-upload-form";
import { parseBulkInputToObject } from "../deploy/helpers/parse-bulk-input";
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
	getPreviewBaseConfig,
	getPreviewDeployment,
} from "./api";
import {
	assemblePreviewScriptSettings,
	extractBuildOutputBindings,
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
	ParsedOutputSettingsConfig,
	ParsedOutputWorkerConfig,
} from "@cloudflare/config";
import type { ContainerNormalizedConfig } from "@cloudflare/containers-shared";
import type {
	Config,
	ContainerApp,
	CustomDomainRoute,
	Exports,
	PreviewsConfig,
	RawEnvironment,
	Route,
} from "@cloudflare/workers-utils";

export type PreviewArgs = {
	script?: string;
	name?: string;
	tag?: string;
	message?: string;
	json?: boolean;
	ignoreBaseConfig: boolean;
	workerName?: string;
	"worker-name"?: string;
	secretsFile?: string;
	/** Parsed `--var` args. CLI-only vars; config vars flow separately via `extractConfigBindings(config)`. */
	cliVars?: Record<string, string>;
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

export type PreviewBuildOutputSettings = ParsedOutputSettingsConfig & {
	isPreview: true;
};

export type PreviewBuildOutput = {
	// Authoritative Worker settings and bindings from Build Output.
	workerConfig: ParsedOutputWorkerConfig;
	// Project settings from Build Output, including the compliance region.
	projectSettings: PreviewBuildOutputSettings;
	// Compiled Worker code and modules, if this is not an assets-only build.
	buildResult?: WorkerBuildResult;
	// Static asset artifacts emitted by the build, if any.
	assets?: Pick<PreviewAssetsOptions, "directory" | "_headers" | "_redirects">;
};

type PreviewWorkerBuildResult = WorkerBuildResult & {
	mainModuleName?: string;
};

/** Verify that Build Output was produced with Preview configuration. */
export function assertPreviewBuildOutputSettings(
	settings: ParsedOutputSettingsConfig | undefined
): asserts settings is PreviewBuildOutputSettings {
	if (settings?.isPreview !== true) {
		throw new UserError("Build Output was not created by a Preview build.", {
			telemetryMessage: "preview build output missing preview intent",
		});
	}
}

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
export type PreviewCallbacks = {
	productionBindingsExpectedInPreview?: Record<string, { type: string }>;
	getNormalizedContainerOptions:
		| ((
				config: Config,
				args: {
					containersRollout?: "gradual" | "immediate" | "none";
					dryRun?: boolean;
				}
		  ) => Promise<ContainerNormalizedConfig[]>)
		| undefined;
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

function getPreviewExports(exports: Exports): Exports {
	const previewExports = structuredClone(exports);
	for (const configuredExport of Object.values(previewExports)) {
		if (
			configuredExport.type === "durable-object" &&
			"container" in configuredExport
		) {
			// Preview containers link to Durable Objects by class name, not by the
			// names used in the top level container config.
			delete configuredExport.container;
		}
	}
	return previewExports;
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
	"Note: This Preview deployment has no active URLs.";

function isCustomDomainRoute(route: Route): route is CustomDomainRoute {
	return typeof route === "object" && route.custom_domain === true;
}

function formatPreviewConfigUpdate(
	config: Config,
	update: RawEnvironment
): string {
	const configPath = config.userConfigPath ?? config.configPath;
	if (!config.targetEnvironment) {
		return formatConfigSnippet(update, configPath).trimEnd();
	}

	return formatConfigSnippet(
		{ env: { [config.targetEnvironment]: update } },
		configPath
	).trimEnd();
}

export function formatNoActivePreviewUrlsMessage(config: Config): string {
	const customDomainRouteEntries = (config.routes ?? [])
		.filter(isCustomDomainRoute)
		.map((route) => ({ route, singular: false }));
	if (config.route && isCustomDomainRoute(config.route)) {
		customDomainRouteEntries.push({ route: config.route, singular: true });
	}
	const customDomainRouteEntry =
		customDomainRouteEntries.find(
			({ route }) => route.previews_enabled === true
		) ?? customDomainRouteEntries[0];
	const customDomainRoute = customDomainRouteEntry?.route;
	const customDomain = customDomainRoute?.pattern ?? "previews.example.com";
	const configPath = config.userConfigPath ?? config.configPath;
	const configName = configFileName(configPath);
	const workersDevConfig = formatPreviewConfigUpdate(config, {
		preview_urls: true,
	});
	const customDomainRouteConfig: CustomDomainRoute = {
		...(customDomainRoute ?? {
			pattern: customDomain,
			custom_domain: true,
			enabled: false,
		}),
		previews_enabled: true,
	};
	let customDomainConfigUpdate: RawEnvironment;
	if (customDomainRouteEntry?.singular) {
		customDomainConfigUpdate = { route: customDomainRouteConfig };
	} else if (customDomainRoute) {
		customDomainConfigUpdate = {
			routes: (config.routes ?? []).map((route) =>
				route === customDomainRoute ? customDomainRouteConfig : route
			),
		};
	} else {
		const routes = config.routes ?? (config.route ? [config.route] : []);
		customDomainConfigUpdate = {
			routes: [...routes, customDomainRouteConfig],
		};
	}
	const customDomainConfig = formatPreviewConfigUpdate(
		config,
		customDomainConfigUpdate
	);
	let productionStatus = "disabled";
	if (customDomainRoute?.enabled === true) {
		productionStatus = "enabled";
	} else if (customDomainRoute?.enabled === undefined && customDomainRoute) {
		productionStatus = "enabled (default)";
	}
	const workersDevAlreadyConfigured = config.preview_urls === true;
	const customDomainAlreadyConfigured =
		customDomainRoute?.previews_enabled === true;
	const cautionText =
		workersDevAlreadyConfigured && customDomainAlreadyConfigured
			? "Caution: `wrangler deploy` publishes the code in your current checkout to the deployed Worker. If you have already made this change, confirm it was applied by running `wrangler deploy` from a clean checkout of your production branch. Then return to your feature branch and run `wrangler preview` again."
			: "Caution: `wrangler deploy` publishes the code in your current checkout to the deployed Worker, not only these settings. If you use Git, commit the configuration change and run `wrangler deploy` from a clean checkout of your production branch. Then return to your feature branch and run `wrangler preview` again.";
	let workersDevInstruction = `Add this to your ${configName}:`;
	if (config.preview_urls === true) {
		workersDevInstruction = `Your ${configName} already contains:`;
	} else if (config.preview_urls === false) {
		workersDevInstruction = `Update this in your ${configName}:`;
	}
	let customDomainInstruction = `Add or update this route in your ${configName}:`;
	if (customDomainRoute?.previews_enabled === true) {
		customDomainInstruction = `Your ${configName} already contains:`;
	} else if (customDomainRoute === undefined && config.route !== undefined) {
		customDomainInstruction = `Replace \`route\` with this in your ${configName}:`;
	}

	return [
		NO_ACTIVE_PREVIEW_URLS_MESSAGE,
		"",
		"For a Workers.dev URL such as:",
		"  https://<preview-name>-<worker>.<subdomain>.workers.dev",
		workersDevInstruction,
		workersDevConfig,
		"",
		"For a custom-domain URL such as:",
		`  https://<preview-name>.${customDomain}`,
		customDomainInstruction,
		customDomainConfig,
		"Resulting route behavior:",
		`  Production: ${productionStatus}`,
		"  Previews: enabled",
		"",
		cautionText,
		"",
		"See https://developers.cloudflare.com/workers/previews/custom-domains/ for more information.",
	].join("\n");
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
	buildResult: PreviewWorkerBuildResult | undefined,
	assetFiles?: { _headers?: string; _redirects?: string }
): { main_module?: string; modules: PreviewDeploymentModule[] } {
	let mainModuleName: string | undefined;
	const deploymentModules: PreviewDeploymentModule[] = [];
	if (buildResult) {
		mainModuleName =
			buildResult.mainModuleName ??
			path.basename(buildResult.resolvedEntryPointPath);
		deploymentModules.push(
			{
				name: mainModuleName,
				content_type:
					moduleTypeMimeType[buildResult.bundleType] ??
					"application/octet-stream",
				content: buildResult.content,
			},
			...buildResult.modules.map((mod) => ({
				name: mod.name,
				content_type:
					moduleTypeMimeType[mod.type ?? "text"] ?? "application/octet-stream",
				content: mod.content,
			}))
		);
	}

	if (buildResult?.sourceMaps) {
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
	buildResult: PreviewWorkerBuildResult | undefined,
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
		secrets?: Record<string, string>;
		cliVars?: Record<string, string>;
	}
): Promise<CreatePreviewDeploymentRequestParams> {
	const previews = config.previews as PreviewsConfig | undefined;
	const request: CreatePreviewDeploymentRequestParams = {};
	const deploymentModules = buildResultToDeploymentModules(buildResult, {
		_headers: options.assetsOptions?._headers,
		_redirects: options.assetsOptions?._redirects,
	});
	if (deploymentModules.main_module !== undefined) {
		request.main_module = deploymentModules.main_module;
	}
	if (deploymentModules.modules.length > 0) {
		request.modules = deploymentModules.modules;
	}

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
	if (Object.keys(config.exports).length > 0) {
		request.exports = getPreviewExports(config.exports);
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
	const placement = previews?.placement ?? config.placement;
	if (placement !== undefined) {
		request.placement =
			placement.mode === "off" ? null : parseConfigPlacement(placement);
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

	// Vars from the CLI (--var) override same-named vars from the previews config
	for (const [varName, varValue] of Object.entries(options.cliVars ?? {})) {
		env[varName] = { type: "plain_text", text: varValue };
	}

	for (const [secretName, secretValue] of Object.entries(
		options.secrets ?? {}
	)) {
		env[secretName] = { type: "secret_text", text: secretValue };
	}

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
	config: Config,
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
		...(pullRequestUrl || pullRequestNumber
			? [
					`${chalk.bold("Pull Request:")} ${
						pullRequestUrl ?? `#${pullRequestNumber}`
					}`,
				]
			: []),
		...formatUrlLines("Unique Deployment", deployment.urls),
		...(hasActiveUrls ? [] : [formatNoActivePreviewUrlsMessage(config)]),
	].join("\n");
}

function logMissingPreviewsBindingsWarning(
	productionBindingsExpectedInPreview: Record<string, { type: string }>,
	remotePreviewDefaultBindings: Record<string, Binding> | undefined,
	localPreviewBindings: Record<string, Binding>
) {
	const availableBindingNames = new Set([
		...Object.keys(remotePreviewDefaultBindings ?? {}),
		...Object.keys(localPreviewBindings),
	]);
	const missingPreviewBindings = Object.fromEntries(
		Object.entries(productionBindingsExpectedInPreview).filter(
			([name]) => !availableBindingNames.has(name)
		)
	);

	if (Object.keys(missingPreviewBindings).length === 0) {
		return;
	}

	logger.warn(`These bindings are configured for your production Worker but not for Previews:

${Object.entries(missingPreviewBindings)
	.map(
		([name, binding]) =>
			`  ${chalk.cyan(name)}  ${chalk.dim(getBindingTypeFriendlyName(binding.type as Parameters<typeof getBindingTypeFriendlyName>[0]))}`
	)
	.join("\n")}

Parts of your Worker that depend on these bindings may not work correctly in the Preview. If this is not intentional, add Preview-safe values to the ${chalk.cyan("previews")} field.

Configuration: https://developers.cloudflare.com/workers/previews/configuration/
Resources: https://developers.cloudflare.com/workers/previews/resources/`);
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
async function runPreview(
	accountId: string,
	args: PreviewArgs,
	config: Config,
	buildResult: PreviewWorkerBuildResult | undefined,
	assetsOptions: PreviewAssetsOptions | undefined,
	callbacks: PreviewCallbacks,
	workerName: string,
	replaceTailConsumersAfterCreate = false
): Promise<PreviewResult> {
	// Parse the secrets file up front so a bad path or malformed contents
	// fails before the preview is created and assets are uploaded.
	let secrets: Record<string, string> | undefined;
	if (args.secretsFile) {
		secrets = (await parseBulkInputToObject(args.secretsFile))?.content;
	}

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
	const previewRequest = assemblePreviewScriptSettings(config);

	let previewResource: PreviewResource;
	if (isNewPreview) {
		previewResource = await createPreview(
			config,
			accountId,
			workerName,
			{ name: previewName, ...previewRequest },
			{ ignoreBaseConfig }
		);
		if (
			replaceTailConsumersAfterCreate &&
			previewRequest.tail_consumers !== undefined
		) {
			previewResource = await editPreview(
				config,
				accountId,
				workerName,
				previewIdentifier,
				{ tail_consumers: previewRequest.tail_consumers }
			);
		}
	} else {
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
			secrets,
			cliVars: args.cliVars,
		}
	);
	const deployment = await createPreviewDeployment(
		config,
		accountId,
		workerName,
		previewResource.id,
		deploymentRequest
	);
	// The API may echo the uploaded env back on the deployment. Redact secret
	// values as soon as it is received, before anything can log or return them
	// (e.g. --json output) - matching `preview secret list`, which only ever
	// outputs secret names and types.
	for (const binding of Object.values(deployment.env ?? {})) {
		if (binding.type === "secret_text") {
			delete binding.text;
		}
	}

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
		const productionBindingsExpectedInPreview =
			callbacks.productionBindingsExpectedInPreview ?? {};
		if (Object.keys(productionBindingsExpectedInPreview).length > 0) {
			const previewBaseConfig = await getPreviewBaseConfig(
				config,
				accountId,
				workerName
			);
			logMissingPreviewsBindingsWarning(
				productionBindingsExpectedInPreview,
				previewBaseConfig.env,
				deploymentRequest.env ?? {}
			);
		}

		logger.log(
			formatPreviewDeploymentSummary(
				config,
				previewResource,
				deployment,
				isNewPreview,
				pullRequest
			)
		);
	}

	return { preview: previewResource, deployment, isNewPreview };
}

/**
 * Upload a Preview from Wrangler configuration.
 *
 * Wrangler resolves its Worker name from CLI and config precedence before
 * entering the shared upload flow. Build Output already contains its final name.
 *
 * @param accountId Account that owns the parent Worker.
 * @param args Wrangler Preview arguments.
 * @param config Resolved Wrangler configuration.
 * @param buildResult Compiled Worker code and modules.
 * @param assetsOptions Static asset configuration and artifacts.
 * @param callbacks Wrangler container integrations.
 */
export async function preview(
	accountId: string,
	args: PreviewArgs,
	config: Config,
	buildResult: WorkerBuildResult,
	assetsOptions: PreviewAssetsOptions | undefined,
	callbacks: PreviewCallbacks
): Promise<PreviewResult> {
	return runPreview(
		accountId,
		args,
		config,
		buildResult,
		assetsOptions,
		callbacks,
		resolveWorkerName(args, config)
	);
}

/**
 * Upload a Preview from resolved Build Output configuration.
 *
 * @param accountId Account that owns the parent Worker.
 * @param args Preview name and deployment annotations.
 * @param buildOutput Exact configuration and artifacts emitted by the build.
 */
export async function previewBuildOutput(
	accountId: string,
	args: Pick<PreviewArgs, "name" | "tag" | "message" | "json">,
	buildOutput: PreviewBuildOutput
): Promise<PreviewResult> {
	const { workerConfig, projectSettings, buildResult, assets } = buildOutput;
	assertPreviewBuildOutputSettings(projectSettings);
	// TODO: Upload domains and triggers when Preview deployments support them.
	// Wrangler can't configure them today, so reject them instead of ignoring them.
	if (workerConfig.domains?.length) {
		throw new UserError(
			"Preview uploads from Build Output don't support the `domains` field.",
			{
				telemetryMessage: "preview build output custom domains not supported",
			}
		);
	}
	if (workerConfig.triggers?.length) {
		throw new UserError(
			"Preview uploads from Build Output don't support the `triggers` field.",
			{
				telemetryMessage: "preview build output triggers not supported",
			}
		);
	}
	if (workerConfig.tailConsumers?.some((consumer) => consumer.streaming)) {
		throw new UserError(
			"Preview uploads from Build Output don't support streaming tail consumers.",
			{
				telemetryMessage:
					"preview build output streaming tail consumer not supported",
			}
		);
	}
	if (
		Object.values(workerConfig.exports ?? {}).some(
			(configExport) =>
				"container" in configExport && configExport.container !== undefined
		)
	) {
		throw new UserError(
			"Preview uploads from Build Output don't support Container-backed Durable Objects.",
			{
				telemetryMessage: "preview build output containers not supported",
			}
		);
	}
	if (
		workerConfig.unsafe?.capnp !== undefined ||
		Object.keys(workerConfig.unsafe?.metadata ?? {}).length > 0
	) {
		throw new UserError(
			"Preview uploads from Build Output don't support unsafe metadata or Cap'n Proto schemas.",
			{
				telemetryMessage: "preview build output unsafe settings not supported",
			}
		);
	}
	const convertedConfig = convertToWranglerConfig(
		workerConfig,
		projectSettings
	);
	const previewBuildResult = buildResult && {
		...buildResult,
		mainModuleName: workerConfig.manifest?.mainModule,
	};
	const bindings = extractBuildOutputBindings(convertedConfig);
	const previewConfig: Config = {
		...defaultWranglerConfig,
		compliance_region: convertedConfig.compliance_region,
		name: workerConfig.name,
		compatibility_date: convertedConfig.compatibility_date,
		compatibility_flags: convertedConfig.compatibility_flags ?? [],
		exports: convertedConfig.exports ?? {},
		limits: convertedConfig.limits,
		cache: convertedConfig.cache,
		placement: convertedConfig.placement,
		observability: convertedConfig.observability,
		logpush: convertedConfig.logpush,
		workers_dev: false,
		preview_urls: true,
		previews: {
			tail_consumers:
				convertedConfig.tail_consumers ??
				(workerConfig.tailConsumers === undefined ? undefined : []),
			unsafe: {
				bindings: Object.entries(bindings).map(([name, binding]) => ({
					name,
					...binding,
				})),
			},
		},
		assets: convertedConfig.assets,
	};
	const assetsOptions = assets && {
		...assets,
		_headers:
			assets._headers ?? maybeGetFile(path.join(assets.directory, "_headers")),
		_redirects:
			assets._redirects ??
			maybeGetFile(path.join(assets.directory, "_redirects")),
		assetConfig: {
			html_handling: convertedConfig.assets?.html_handling,
			not_found_handling: convertedConfig.assets?.not_found_handling,
		},
		run_worker_first: convertedConfig.assets?.run_worker_first,
	};
	return runPreview(
		accountId,
		{ ...args, ignoreBaseConfig: false },
		previewConfig,
		previewBuildResult,
		assetsOptions,
		{
			getNormalizedContainerOptions: undefined,
			deployPreviewContainers: undefined,
		},
		workerConfig.name,
		true
	);
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
