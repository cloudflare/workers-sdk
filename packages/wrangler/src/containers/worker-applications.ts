import {
	ApiError,
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
 * of that Worker's Durable Object namespaces, and the application takes the
 * namespace's ID as its own. Deleting the Worker removes those namespaces but
 * leaves the applications running and billing, so the pairing has to be
 * resolved from the namespaces while the Worker still exists.
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
	const ownedNamespaceIds = [
		...new Set(
			namespaces
				.filter(
					(namespace) =>
						namespace.script === scriptName &&
						namespace.preview === undefined &&
						namespace.dispatch_namespace === undefined
				)
				.map((namespace) => namespace.id)
		),
	];
	// A Worker without Durable Object namespaces cannot own Container
	// applications, so the Containers API is never called for one.
	if (ownedNamespaceIds.length === 0) {
		return [];
	}

	await fillOpenAPIConfiguration(config, containersScope);

	const applications: WorkerContainerApplication[] = [];
	for (const namespaceId of ownedNamespaceIds) {
		const application = await getContainerApplication(namespaceId);
		if (
			application !== undefined &&
			application.scheduling_policy === SchedulingPolicy.DURABLE_OBJECT &&
			application.durable_objects?.namespace_id === namespaceId
		) {
			applications.push({ id: application.id, name: application.name });
		}
	}
	return applications;
}

/** Fetch an application by ID, treating a missing application as absent. */
async function getContainerApplication(
	applicationId: string
): Promise<
	Awaited<ReturnType<typeof ApplicationsService.getApplication>> | undefined
> {
	try {
		return await ApplicationsService.getApplication(applicationId);
	} catch (error) {
		if (error instanceof ApiError && error.status === 404) {
			return undefined;
		}
		throw error;
	}
}

/** Delete a Container application by ID. */
export async function deleteContainerApplication(applicationId: string) {
	await ApplicationsService.deleteApplication(applicationId);
}
