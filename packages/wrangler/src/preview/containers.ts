import { ApplicationsService } from "@cloudflare/containers-shared";
import { getDockerPath, UserError } from "@cloudflare/workers-utils";
import {
	fillOpenAPIConfiguration,
	promiseSpinner,
} from "../cloudchamber/common";
import { containersScope } from "../containers";
import { buildContainer } from "../containers/build";
import { getNormalizedContainerOptions } from "../containers/config";
import { apply } from "../containers/deploy";
import { logger } from "../logger";
import type { DeploymentResource } from "./api";
import type { ImageURIConfig } from "@cloudflare/containers-shared";
import type {
	Config,
	ContainerApp,
	PreviewsConfig,
} from "@cloudflare/workers-utils";

/**
 * Compose the auto-generated container application name for a preview-scoped
 * container. Mirrors the EWC server-side `PreviewNamer` so wrangler-managed
 * apps can be reliably correlated with the preview's own DO namespaces.
 *
 * Format: `{parentWorkerName}_{previewSlug}_{className}`.
 */
export function previewContainerAppName(
	parentWorkerName: string,
	previewSlug: string,
	className: string
): string {
	return `${parentWorkerName}_${previewSlug}_${className}`;
}

/**
 * Returns the set of DO `class_name`s that are bound in the preview AND
 * implemented by THIS script (i.e. no `script_name` override). DOs implemented
 * by another worker have their containers managed by that worker, so we
 * intentionally exclude them.
 */
export function getOwnPreviewBoundDOClassNames(
	previews: PreviewsConfig | undefined
): Set<string> {
	return new Set(
		(previews?.durable_objects?.bindings ?? [])
			.filter((b) => b.script_name === undefined)
			.map((b) => b.class_name)
	);
}

/**
 * Construct a synthetic `Config` that overlays the previews block onto the
 * top-level config: containers come from `previews.containers` (with
 * auto-generated names), DO bindings come from `previews.durable_objects`,
 * and observability defaults to the previews override if set. This lets us
 * reuse `getNormalizedContainerOptions` and `apply` from the standard
 * `wrangler deploy` container path without forking either.
 *
 * Returns `undefined` if no containers in the previews block resolve to an
 * own (non cross-script) DO binding in the preview.
 */
function buildPreviewContainerConfig(
	config: Config,
	parentWorkerName: string,
	previewSlug: string,
	previewContainers: ContainerApp[]
): Config | undefined {
	const previews = config.previews as PreviewsConfig | undefined;
	const ownBoundDOClasses = getOwnPreviewBoundDOClassNames(previews);
	const filteredContainers = previewContainers
		.filter((c) => ownBoundDOClasses.has(c.class_name))
		.map((c) => ({
			...c,
			name: previewContainerAppName(
				parentWorkerName,
				previewSlug,
				c.class_name
			),
		}));

	if (filteredContainers.length === 0) {
		return undefined;
	}

	const observability = previews?.observability ?? config.observability;
	return {
		...config,
		containers: filteredContainers,
		durable_objects: {
			bindings: previews?.durable_objects?.bindings ?? [],
		},
		observability,
	};
}

/**
 * Deploy preview-scoped container applications after a preview deployment
 * has been created. For each container declared in `previews.containers`
 * whose class is bound to an own DO in the preview, we register or update a
 * Cloudchamber application named `{worker}_{previewSlug}_{className}` bound to
 * the DO namespace_id resolved by the preview deployment API.
 *
 * The DO namespace for a preview is provisioned by the workers control plane
 * and returned in the create-deployment response — we read it directly from
 * `deployment.env` rather than re-fetching.
 */
export async function deployPreviewContainers(
	config: Config,
	parentWorkerName: string,
	previewSlug: string,
	deployment: DeploymentResource,
	previewContainers: ContainerApp[]
): Promise<void> {
	const scopedConfig = buildPreviewContainerConfig(
		config,
		parentWorkerName,
		previewSlug,
		previewContainers
	);
	if (!scopedConfig) {
		return;
	}

	const normalised = await getNormalizedContainerOptions(scopedConfig, {
		dryRun: false,
	});
	if (normalised.length === 0) {
		return;
	}

	await fillOpenAPIConfiguration(config, containersScope);
	const dockerPath = getDockerPath();

	const classNameToNamespaceId = new Map<string, string>();
	for (const binding of Object.values(deployment.env ?? {})) {
		if (
			binding.type === "durable_object_namespace" &&
			binding.class_name &&
			binding.namespace_id
		) {
			classNameToNamespaceId.set(binding.class_name, binding.namespace_id);
		}
	}

	for (const container of normalised) {
		const namespaceId = classNameToNamespaceId.get(container.class_name);
		if (!namespaceId) {
			throw new UserError(
				`Could not deploy preview container application "${container.name}": the preview deployment API did not return a namespace_id for Durable Object class "${container.class_name}". This is likely a bug in Wrangler — please file an issue.`
			);
		}

		let imageRef;
		if ("dockerfile" in container) {
			imageRef = await buildContainer(
				container,
				deployment.id,
				false,
				dockerPath
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
 * Delete every Cloudchamber application whose name matches the preview
 * scoped naming pattern `{parentWorkerName}_{previewSlug}_*`. Failures on
 * individual apps are logged but do not abort the loop, so a partial cleanup
 * failure does not prevent the preview itself from being deleted.
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

	const prefix = `${parentWorkerName}_${previewSlug}_`;
	let apps;
	try {
		apps = await promiseSpinner(ApplicationsService.listApplications(), {
			message: "Listing preview container applications",
		});
	} catch (error) {
		logger.warn(
			`Failed to list preview container applications for cleanup: ${
				error instanceof Error ? error.message : String(error)
			}`
		);
		return;
	}

	const matches = apps.filter((app) => app.name.startsWith(prefix));
	for (const app of matches) {
		try {
			await promiseSpinner(ApplicationsService.deleteApplication(app.id), {
				message: `Deleting container application "${app.name}"`,
			});
		} catch (error) {
			logger.warn(
				`Failed to delete preview container application "${app.name}": ${
					error instanceof Error ? error.message : String(error)
				}`
			);
		}
	}
}
