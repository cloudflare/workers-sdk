import {
	ApplicationsService,
	initContainersSharedContext,
	listDurableObjects,
	SchedulingPolicy,
} from "@cloudflare/containers-shared";
import { fetchPagedListResult, fetchResult } from "../cfetch";
import { fillOpenAPIConfiguration } from "../cloudchamber/common";
import { logger } from "../logger";
import { containersScope } from "./index";
import type { Config } from "@cloudflare/workers-utils";

export type WorkerContainerApplication = {
	id: string;
	name: string;
};

/**
 * The Container applications that `wrangler deploy` created for a Worker.
 *
 * Every Container application Wrangler provisions for a Worker is backed by one
 * of that Worker's Durable Object namespaces, and the application records that
 * namespace in `durable_objects.namespace_id`. Deleting the Worker removes the
 * namespaces but leaves the applications running and billing, so the pairing has
 * to be resolved from the namespaces while the Worker still exists.
 *
 * Matching on the recorded namespace rather than on the application's own ID
 * means a change to how application IDs are assigned cannot silently stop this
 * lookup from finding anything.
 *
 * Applications deployed standalone (for example with `wrangler containers
 * apply`) are not Durable Object managed and are deliberately not returned here,
 * because nothing ties them to this Worker.
 */
export async function findWorkerContainerApplications(
	config: Config,
	accountId: string,
	scriptName: string
): Promise<WorkerContainerApplication[]> {
	initContainersSharedContext({ logger, fetchPagedListResult, fetchResult });

	const namespaces = await listDurableObjects(config, accountId);
	const ownedNamespaceIds = new Set(
		namespaces
			.filter(
				(namespace) =>
					namespace.script === scriptName &&
					namespace.preview === undefined &&
					namespace.dispatch_namespace === undefined
			)
			.map((namespace) => namespace.id)
	);
	// A Worker without Durable Object namespaces cannot own Container
	// applications, so the Containers API is never called for one.
	if (ownedNamespaceIds.size === 0) {
		return [];
	}

	await fillOpenAPIConfiguration(config, containersScope);

	const applications = await ApplicationsService.listApplications();
	return applications
		.filter(
			(application) =>
				application.scheduling_policy === SchedulingPolicy.DURABLE_OBJECT &&
				application.durable_objects !== undefined &&
				ownedNamespaceIds.has(application.durable_objects.namespace_id)
		)
		.map(({ id, name }) => ({ id, name }));
}

/** Delete a Container application by ID. */
export async function deleteContainerApplication(applicationId: string) {
	await ApplicationsService.deleteApplication(applicationId);
}
