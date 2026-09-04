import { getLogLevel, setLogLevel } from "@cloudflare/cli-shared-helpers";
import {
	buildContainerImages,
	initContainersSharedContext,
	verifyDockerInstalled,
} from "@cloudflare/containers-shared";
import {
	getPreviewOwnedContainerClassNames,
	previewContainerAppName,
} from "@cloudflare/deploy-helpers";
import {
	configFileName,
	getDockerPath,
	UserError,
} from "@cloudflare/workers-utils";
import { fetchResult } from "../cfetch";
import { fillOpenAPIConfiguration } from "../cloudchamber/common";
import { containersScope } from "../containers";
import { getNormalizedContainerOptions } from "../containers/config";
import { logger, runWithLogLevel } from "../logger";
import type {
	BuiltContainerDeployment,
	ContainerNormalizedConfig,
} from "@cloudflare/containers-shared";
import type { PreviewContainerPreparation } from "@cloudflare/deploy-helpers";
import type {
	Config,
	ContainerApp,
	PreviewsConfig,
} from "@cloudflare/workers-utils";

/**
 * Confirm the API token carries the `containers` scope. `applyPreviewContainers`
 * checks this too, but not until the preview deployment exists, so `preview()`
 * calls this before creating the deployment.
 */
export async function verifyContainersScope(
	scopedConfig: Config
): Promise<void> {
	await fillOpenAPIConfiguration(scopedConfig, containersScope);
}

/**
 * Validate and normalise container config, and confirm Docker is installed for
 * any container built from a Dockerfile. Called before the preview deployment is
 * created, so a bad config or a missing Docker install fails before the preview
 * goes live, rather than leaving a preview running that advertises containers
 * nothing ever built.
 *
 * Returns an empty `normalisedContainerConfig` when there's nothing to deploy,
 * whether because `previews.containers` is empty or every entry resolves to a
 * cross-script DO binding owned by another Worker. Throws if an entry's
 * `class_name` matches no DO binding in `previews.durable_objects`.
 */
export async function preparePreviewContainers(
	config: Config,
	workerName: string,
	previewSlug: string,
	options: { quiet: boolean }
): Promise<PreviewContainerPreparation> {
	initContainersSharedContext({
		logger,
		fetchResult,
	});

	return runPreviewContainerOperation(options, async () => {
		const previewContainers =
			(config.previews as PreviewsConfig | undefined)?.containers ?? [];
		if (previewContainers.length === 0) {
			return emptyPreviewContainerPreparation();
		}

		const scopedContainerConfig = buildPreviewContainerConfig(
			config,
			workerName,
			previewSlug,
			previewContainers
		);
		if (!scopedContainerConfig) {
			return emptyPreviewContainerPreparation();
		}

		const normalisedContainerConfig = await getNormalizedContainerOptions(
			scopedContainerConfig,
			{ dryRun: false }
		);

		const containersNeedingDocker = normalisedContainerConfig.filter(
			(container) => "dockerfile" in container
		);
		if (containersNeedingDocker.length > 0) {
			const dockerPath = getDockerPath();
			await verifyDockerInstalled({
				dockerPath,
				operation: "creating a preview",
				imageNoun:
					containersNeedingDocker.length !== 1
						? "the configured images"
						: "the configured image",
				hint: 'If you cannot run Docker locally, set "image" to a prebuilt registry image instead of a Dockerfile path for the affected entries in "previews.containers".',
			});

			// Applying containers checks the token's scope as well, but only after
			// the deployment exists. Checking it here stops a badly scoped token from
			// leaving a live preview that advertises containers nothing ever built.
			await verifyContainersScope(scopedContainerConfig);

			return {
				scopedContainerConfig,
				normalisedContainerConfig,
				builtContainerDeployments: await buildContainerImages(
					normalisedContainerConfig,
					dockerPath,
					false
				),
			};
		}

		await verifyContainersScope(scopedContainerConfig);
		return {
			scopedContainerConfig,
			normalisedContainerConfig,
			builtContainerDeployments: [],
		};
	});
}

function emptyPreviewContainerPreparation(): PreviewContainerPreparation {
	return {
		scopedContainerConfig: undefined,
		normalisedContainerConfig: [],
		builtContainerDeployments: [],
	};
}

/**
 * Construct a synthetic `Config` for the preview's containers, so we can reuse
 * the standard Wrangler container config normalisation. Containers come from
 * `previews.containers`, defaulting each unnamed entry to a generated
 * application name, and DO bindings come from `previews.durable_objects`.
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

	const linkedContainers = previewContainers.map((container) => {
		const className = container.class_name;
		if (className === undefined) {
			// A preview container has to name its Durable Object class itself. The
			// other direction of the link, a Durable Object naming its container
			// through `exports[Class].container`, resolves against the top-level
			// `containers` array, so it can only ever reach a container this preview
			// does not own.
			throw new UserError(
				`A container entry in "previews.containers" is missing "class_name". A preview container must name the Durable Object class it backs, even where a Durable Object declared in "exports" names its container instead.`,
				{
					telemetryMessage: "preview container missing class_name",
				}
			);
		}
		return { container, className };
	});

	for (const { className } of linkedContainers) {
		if (
			ownedDOClasses.has(className) ||
			previewDOBindings.some((b) => b.class_name === className)
		) {
			continue;
		}
		// A container whose class matches no Durable Object at all is a
		// misconfiguration, almost always a typo, and silently dropping it would
		// hand back a preview with no container and no explanation, so reject it
		// here, before the preview deployment is created.
		throw new UserError(
			`The container class_name "${className}" in "previews.containers" does not match any Durable Object class in your ${configFileName(config.configPath)} file. Declare the class in "migrations" or "exports", or bind it under "previews.durable_objects".`,
			{
				telemetryMessage: "no preview DO class matches container class_name",
			}
		);
	}

	// A class that matches only a binding carrying `script_name` is excluded
	// rather than rejected: that DO is implemented by another Worker, which owns
	// its own container application.
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

	// `observability` is carried over because a container application has its own
	// observability setting, which `getNormalizedContainerOptions` reads from the
	// config it is given. The container path does not read `logpush`, `limits`, or
	// `cache`, so overlaying those here would have no effect.
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

async function runPreviewContainerOperation<T>(
	options: { quiet: boolean },
	operation: () => Promise<T>
): Promise<T> {
	if (!options.quiet) {
		return operation();
	}

	// Two independent log levels gate stdout here. `logger` reads an
	// AsyncLocalStorage override and `@cloudflare/cli`'s `logRaw` reads module
	// level state, so lowering one leaves the other printing. `logger` drops
	// messages above its level instead of redirecting them, so it stays at
	// `warn` to keep warnings and errors on stderr. `logRaw` only writes to
	// stdout, so it can go lower.
	const previousLogLevel = getLogLevel();
	setLogLevel("error");
	try {
		return await runWithLogLevel("warn", operation);
	} finally {
		setLogLevel(previousLogLevel);
	}
}
