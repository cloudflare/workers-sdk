import { getLogLevel, setLogLevel } from "@cloudflare/cli-shared-helpers";
import { ApplicationsService } from "@cloudflare/containers-shared";
import {
	previewContainerAppName,
	type DeploymentResource,
} from "@cloudflare/deploy-helpers";
import { getDockerPath, UserError } from "@cloudflare/workers-utils";
import {
	fillOpenAPIConfiguration,
	promiseSpinner,
} from "../cloudchamber/common";
import { containersScope } from "../containers";
import { buildContainer } from "../containers/build";
import { apply } from "../containers/deploy";
import { logger, runWithLogLevel } from "../logger";
import type {
	ContainerNormalizedConfig,
	ImageURIConfig,
} from "@cloudflare/containers-shared";
import type { Config, PreviewsConfig } from "@cloudflare/workers-utils";

/**
 * Build and apply the container applications validated by
 * `@cloudflare/deploy-helpers`'s `preview()` (via `getNormalizedContainerOptions`).
 * For each normalised container, register or update a Cloudchamber
 * application bound to the DO namespace_id resolved by the preview
 * deployment API.
 *
 * The DO namespace for a preview is provisioned by the workers control plane
 * and returned in the create-deployment response, so we read it directly from
 * `deployment.env` rather than re-fetching.
 */
export async function deployPreviewContainers(
	scopedConfig: Config,
	normalisedContainerConfig: ContainerNormalizedConfig[],
	deployment: DeploymentResource,
	options: { quiet: boolean }
): Promise<void> {
	if (!options.quiet) {
		return applyPreviewContainers(
			scopedConfig,
			normalisedContainerConfig,
			deployment
		);
	}

	// Two independent log levels gate stdout here. `logger` reads an
	// AsyncLocalStorage override and `@cloudflare/cli`'s `logRaw` reads module
	// level state, so lowering one leaves the other printing. Warnings and
	// errors write to stderr and are unaffected.
	const previousLogLevel = getLogLevel();
	setLogLevel("error");
	try {
		return await runWithLogLevel("error", () =>
			applyPreviewContainers(
				scopedConfig,
				normalisedContainerConfig,
				deployment
			)
		);
	} finally {
		setLogLevel(previousLogLevel);
	}
}

async function applyPreviewContainers(
	scopedConfig: Config,
	normalisedContainerConfig: ContainerNormalizedConfig[],
	deployment: DeploymentResource
): Promise<void> {
	await fillOpenAPIConfiguration(scopedConfig, containersScope);
	const dockerPath = getDockerPath();

	// Skip bindings carrying `script_name`. Those name a Durable Object
	// implemented by another Worker, which owns its own container application,
	// so their namespace belongs to that Worker. A preview may bind the same
	// class name both locally and cross-script, and since this map is keyed on
	// class name alone, an unfiltered cross-script entry could overwrite the
	// preview's own namespace_id and attach the container to the wrong storage.
	// `wrangler deploy` applies the same restriction (see containers/deploy.ts).
	const classNameToNamespaceId = new Map<string, string>();
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

	for (const container of normalisedContainerConfig) {
		const namespaceId = classNameToNamespaceId.get(container.class_name);
		if (!namespaceId) {
			throw new UserError(
				`Could not deploy preview container application "${container.name}": the preview deployment API did not return a namespace_id for Durable Object class "${container.class_name}". This is likely a bug in Wrangler. Please file an issue.`,
				{
					telemetryMessage: "preview containers deploy missing do namespace id",
				}
			);
		}

		let imageRef;
		if ("dockerfile" in container) {
			// Docker rejects uppercase characters in an image repository name, and
			// a preview application name embeds the Durable Object class name
			// verbatim, which is conventionally PascalCase. Lowercase the name for
			// the local image tag only. `apply` below needs the exact application
			// name, which the control plane matches on when reconciling previews.
			imageRef = await buildContainer(
				{ ...container, name: container.name.toLowerCase() },
				deployment.id,
				false,
				dockerPath,
				// `preview()` already verified Docker before creating the
				// deployment, so skip the redundant per-container check.
				false
			);
		} else {
			imageRef = { newTag: (container as ImageURIConfig).image_uri };
		}

		await apply(
			{ imageRef, durable_object_namespace_id: namespaceId },
			container,
			scopedConfig
		);
	}
}

/**
 * Delete the Cloudchamber applications for every class currently declared in
 * `previews.containers`, matched by exact name (see `previewContainerAppName`).
 *
 * Failing to list the applications throws, because the caller must then keep
 * the preview alive to preserve the slug that names them. Failing to delete an
 * application that was successfully listed only warns, since the warning
 * carries the name and id needed to remove it by hand.
 *
 * Skipped entirely if `previews.containers` is empty, to avoid unnecessary
 * Cloudchamber API calls.
 */
export async function deletePreviewContainers(
	config: Config,
	parentWorkerName: string,
	previewSlug: string
): Promise<void> {
	const previews = config.previews as PreviewsConfig | undefined;
	if (!previews?.containers || previews.containers.length === 0) {
		return;
	}

	await fillOpenAPIConfiguration(config, containersScope);

	// Match on the exact set of currently declared container app names rather
	// than a `{parentWorkerName}_{previewSlug}_` prefix. A worker name may
	// itself contain underscores, so a worker literally named
	// `{otherWorkerName}_{otherPreviewSlug}` would have every one of its own
	// container apps swept up by a prefix match when deleting an unrelated
	// worker's preview.
	const expectedNames = new Set(
		previews.containers.map((c) =>
			previewContainerAppName(parentWorkerName, previewSlug, c.class_name)
		)
	);

	let apps;
	try {
		apps = await promiseSpinner(ApplicationsService.listApplications(), {
			message: "Listing preview container applications",
		});
	} catch (error) {
		throw new UserError(
			`Could not list the container applications for Preview "${previewSlug}": ${error instanceof Error ? error.message : String(error)}\n` +
				`The Preview was not deleted. Its slug is the only thing that names those applications, so deleting it now would leave them running and billable with no way to find them. Please retry.`,
			{
				telemetryMessage: "preview delete container application list failed",
			}
		);
	}

	const matches = apps.filter((app) => expectedNames.has(app.name));
	if (matches.length === 0) {
		return;
	}

	// One spinner for the whole batch. The deletes run concurrently and
	// `promiseSpinner` starts an independent spinner per call, so wrapping each
	// delete individually would leave several spinners redrawing over each
	// other. Failures are collected and warned about after the spinner clears,
	// for the same reason.
	const failures = await promiseSpinner(
		Promise.all(
			matches.map(async (app) => {
				try {
					await ApplicationsService.deleteApplication(app.id);
					return undefined;
				} catch (error) {
					return `Failed to delete preview container application "${app.name}": ${error instanceof Error ? error.message : String(error)}`;
				}
			})
		),
		{
			message: `Deleting ${matches.length} preview container application${matches.length === 1 ? "" : "s"}`,
		}
	);

	for (const failure of failures) {
		if (failure !== undefined) {
			logger.warn(failure);
		}
	}
}
