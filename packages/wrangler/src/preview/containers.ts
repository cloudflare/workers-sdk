import { getLogLevel, setLogLevel } from "@cloudflare/cli-shared-helpers";
import { getDockerPath, UserError } from "@cloudflare/workers-utils";
import { fillOpenAPIConfiguration } from "../cloudchamber/common";
import { containersScope } from "../containers";
import { buildContainer } from "../containers/build";
import { apply, listDurableObjects } from "../containers/deploy";
import { runWithLogLevel } from "../logger";
import type { DurableObjectNamespace } from "../containers/deploy";
import type { ContainerNormalizedConfig } from "@cloudflare/containers-shared";
import type { DeploymentResource } from "@cloudflare/deploy-helpers";
import type { Config } from "@cloudflare/workers-utils";

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
 * Build and apply the container applications validated by
 * `@cloudflare/deploy-helpers`'s `preview()` (via `getNormalizedContainerOptions`).
 * For each normalised container, register or update a Cloudchamber
 * application bound to the DO namespace_id resolved by the preview
 * deployment API.
 *
 * The DO namespace for a preview is provisioned by the workers control plane.
 * For a bound Durable Object it comes back in the create-deployment response,
 * so we read it from `deployment.env` rather than re-fetching. A Durable Object
 * reached only through `ctx.exports` has no binding to carry it, so those fall
 * back to the namespaces list API.
 */
export async function deployPreviewContainers(
	scopedConfig: Config,
	normalisedContainerConfig: ContainerNormalizedConfig[],
	deployment: DeploymentResource,
	accountId: string,
	options: { quiet: boolean }
): Promise<void> {
	if (!options.quiet) {
		return applyPreviewContainers(
			scopedConfig,
			normalisedContainerConfig,
			deployment,
			accountId
		);
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
		return await runWithLogLevel("warn", () =>
			applyPreviewContainers(
				scopedConfig,
				normalisedContainerConfig,
				deployment,
				accountId
			)
		);
	} finally {
		setLogLevel(previousLogLevel);
	}
}

/**
 * Resolve each normalised container's Durable Object namespace and build then
 * apply its Cloudchamber application.
 *
 * @param scopedConfig - Synthetic config scoped to the preview's containers.
 * @param normalisedContainerConfig - Containers to build and apply.
 * @param deployment - The preview deployment the containers belong to.
 * @param accountId - Account the preview belongs to.
 * @returns A promise that resolves once every container has been applied.
 */
async function applyPreviewContainers(
	scopedConfig: Config,
	normalisedContainerConfig: ContainerNormalizedConfig[],
	deployment: DeploymentResource,
	accountId: string
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
				false,
				// Selects the managed registry for the account's compliance
				// region. Without it the push defaults to the public registry.
				scopedConfig
			);
		} else {
			imageRef = { newTag: container.image_uri };
		}

		await apply(
			{ imageRef, durable_object_namespace_id: namespaceId },
			container,
			scopedConfig
		);
	}
}
