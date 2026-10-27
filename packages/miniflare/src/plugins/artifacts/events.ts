import { createHash } from "node:crypto";
import { MiniflareCoreError } from "../../shared";
import { getQueueServiceName } from "../../workers/queues/constants";
import {
	getEnvBindingsOfType,
	getExportsOfType,
	getTriggersOfType,
} from "../shared";
import { getWorkflowBindingServiceName } from "../workflows";
import type {
	ParsedInstanceOptions,
	ParsedWorkerOptions,
} from "../../config/schema";
import type { Worker_Binding } from "../../runtime";
import type {
	ArtifactsEventRoute,
	ArtifactsEventSourceType,
	ArtifactsEventType,
} from "../../workers/artifacts/events";

/** Where an Artifacts subscription delivers events. */
export type ArtifactsEventDestination =
	| { type: "queue"; queue: string }
	| { type: "workflow"; workflowName: string };

/** An Artifacts subscription resolved across every Worker in an instance. */
export interface ArtifactsEventSubscriptionRoute {
	id: string;
	types: ArtifactsEventType[] | null;
	sourceType: ArtifactsEventSourceType | null;
	namespace: string | null;
	repoName: string | null;
	destination: ArtifactsEventDestination;
}

/**
 * Collects Artifacts Workflow triggers and Queue subscriptions.
 *
 * @param allWorkerOpts - Options of every Worker in this instance
 * @param sharedOpts - Instance options
 * @returns Every subscription, in configuration order
 * @throws {MiniflareCoreError} If a trigger targets a Workflow its Worker
 * doesn't define, matching deploy-time validation
 */
export function getArtifactsEventSubscriptions(
	allWorkerOpts: ParsedWorkerOptions[],
	sharedOpts: ParsedInstanceOptions
): ArtifactsEventSubscriptionRoute[] {
	const routes: ArtifactsEventSubscriptionRoute[] = [];
	for (const { config } of allWorkerOpts) {
		const ownedWorkflows = getOwnedWorkflowNames(config);
		for (const trigger of getTriggersOfType(config, "artifacts-event")) {
			for (const target of trigger.targets) {
				if (!ownedWorkflows.has(target.workflowName)) {
					throw new MiniflareCoreError(
						"ERR_VALIDATION",
						`Artifacts event trigger "${trigger.eventType}" of Worker "${config.name}" targets Workflow "${target.workflowName}", which that Worker doesn't define.`
					);
				}
				routes.push(
					withId({
						types: [trigger.eventType],
						sourceType: null,
						namespace: trigger.filter?.namespace ?? null,
						repoName: trigger.filter?.repoName ?? null,
						destination: {
							type: "workflow",
							workflowName: target.workflowName,
						},
						owner: config.name,
					})
				);
			}
		}
	}
	for (const subscription of sharedOpts.artifactsEventSubscriptions ?? []) {
		const { source } = subscription;
		routes.push(
			withId({
				types: subscription.events ?? null,
				sourceType: source.type,
				namespace: source.type === "artifacts.repo" ? source.namespace : null,
				repoName: source.type === "artifacts.repo" ? source.repoName : null,
				destination: { type: "queue", queue: subscription.queue },
				owner: null,
			})
		);
	}
	return routes;
}

/**
 * Builds the routes and target bindings for one local namespace.
 *
 * @param subscriptions - Every subscription in the instance
 * @param namespace - Local namespace publishing events
 * @returns Routes for the namespace's binding Worker, and their target bindings
 */
export function getArtifactsNamespaceEventBindings(
	subscriptions: ArtifactsEventSubscriptionRoute[],
	namespace: string
): Worker_Binding[] {
	const routes: ArtifactsEventRoute[] = [];
	const bindings: Worker_Binding[] = [];
	for (const subscription of subscriptions) {
		if (
			subscription.namespace !== null &&
			subscription.namespace !== namespace
		) {
			continue;
		}
		const binding = `ARTIFACTS_EVENT_TARGET_${routes.length}`;
		const { destination } = subscription;
		bindings.push(
			destination.type === "queue"
				? {
						name: binding,
						queue: { name: getQueueServiceName(destination.queue) },
					}
				: {
						name: binding,
						service: {
							name: getWorkflowBindingServiceName(destination.workflowName),
							entrypoint: "WorkflowBinding",
						},
					}
		);
		routes.push({
			id: subscription.id,
			types: subscription.types,
			sourceType: subscription.sourceType,
			repoName: subscription.repoName,
			target: { type: destination.type, binding },
		});
	}
	if (routes.length === 0) {
		return [];
	}
	return [{ name: "eventRoutes", json: JSON.stringify(routes) }, ...bindings];
}

function getOwnedWorkflowNames(
	config: ParsedWorkerOptions["config"]
): Set<string> {
	const names = new Set(
		getExportsOfType(config, "workflow").map(([, workflow]) => workflow.name)
	);
	for (const [, binding] of getEnvBindingsOfType(config, "workflow")) {
		if (binding.worker === config.name) {
			names.add(binding.name);
		}
	}
	return names;
}

function withId(
	subscription: Omit<ArtifactsEventSubscriptionRoute, "id"> & {
		owner: string | null;
	}
): ArtifactsEventSubscriptionRoute {
	const { owner, ...route } = subscription;
	// Identical configuration keeps its subscription ID across reloads.
	const id = createHash("sha256")
		.update(JSON.stringify({ owner, ...route }))
		.digest("hex")
		.slice(0, 32);
	return { id, ...route };
}
