import { createHash } from "node:crypto";
import { MiniflareCoreError } from "../../shared";
import { getArtifactsEventTypesForSource } from "../../workers/artifacts/events";
import { getQueueServiceName } from "../../workers/queues/constants";
import {
	getEnvBindingsOfType,
	getExportsOfType,
	getTriggersOfType,
} from "../shared";
import { getWorkflowBindingServiceName } from "../workflows";
import type { ArtifactsEventSubscription } from "../../config/artifacts-events";
import type {
	ParsedInstanceOptions,
	ParsedWorkerOptions,
} from "../../config/schema";
import type { Worker_Binding } from "../../runtime";
import type {
	ArtifactsEventRoute,
	ArtifactsEventType,
} from "../../workers/artifacts/events";

/** Where an Artifacts subscription delivers events. */
export type ArtifactsEventDestination =
	| { type: "queue"; queue: string }
	| { type: "workflow"; workflowName: string };

/** An Artifacts subscription resolved across every Worker in an instance. */
export interface ArtifactsEventSubscriptionRoute {
	id: string;
	/** Event types to deliver; never empty. */
	types: ArtifactsEventType[];
	/** Restricts events to this namespace, if set. */
	namespace?: string;
	/** Restricts events to this repository, if set. */
	repoName?: string;
	destination: ArtifactsEventDestination;
}

type Worker = ParsedWorkerOptions["config"];

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
	return [
		...allWorkerOpts.flatMap(({ config }) => getWorkflowTriggerRoutes(config)),
		...(sharedOpts.artifactsEventSubscriptions ?? []).map(getQueueRoute),
	];
}

/**
 * Builds the event bindings for one local namespace's binding Worker.
 *
 * @param subscriptions - Every subscription in the instance
 * @param namespace - Local namespace publishing events
 * @returns An `eventRoutes` JSON binding plus one target binding per route,
 * or no bindings when nothing subscribes to the namespace
 */
export function getArtifactsNamespaceEventBindings(
	subscriptions: ArtifactsEventSubscriptionRoute[],
	namespace: string
): Worker_Binding[] {
	const routes: ArtifactsEventRoute[] = [];
	const bindings: Worker_Binding[] = [];
	for (const subscription of subscriptions) {
		if (
			subscription.namespace !== undefined &&
			subscription.namespace !== namespace
		) {
			continue;
		}
		// Indexing by route keeps binding names unique within the Worker.
		const binding = `ARTIFACTS_EVENT_TARGET_${routes.length}`;
		bindings.push(getTargetBinding(binding, subscription.destination));
		routes.push({
			id: subscription.id,
			types: subscription.types,
			...(subscription.repoName === undefined
				? {}
				: { repoName: subscription.repoName }),
			target: { type: subscription.destination.type, binding },
		});
	}
	if (routes.length === 0) {
		return [];
	}
	return [{ name: "eventRoutes", json: JSON.stringify(routes) }, ...bindings];
}

function getWorkflowTriggerRoutes(
	config: Worker
): ArtifactsEventSubscriptionRoute[] {
	const ownedWorkflows = getOwnedWorkflowNames(config);
	return getTriggersOfType(config, "artifacts-event").flatMap((trigger) =>
		trigger.targets.map(({ workflowName }) => {
			if (!ownedWorkflows.has(workflowName)) {
				throw new MiniflareCoreError(
					"ERR_VALIDATION",
					`Artifacts event trigger "${trigger.eventType}" of Worker "${config.name}" targets Workflow "${workflowName}", which that Worker doesn't define.`
				);
			}
			return withId(config.name, {
				types: [trigger.eventType],
				...trigger.filter,
				destination: { type: "workflow", workflowName },
			});
		})
	);
}

function getQueueRoute(
	subscription: ArtifactsEventSubscription
): ArtifactsEventSubscriptionRoute {
	const { source } = subscription;
	return withId(null, {
		// Resolve "every event of the source" here, so routes always list types.
		types: subscription.events ?? getArtifactsEventTypesForSource(source.type),
		...(source.type === "artifacts.repo"
			? { namespace: source.namespace, repoName: source.repoName }
			: {}),
		destination: { type: "queue", queue: subscription.queue },
	});
}

function getTargetBinding(
	name: string,
	destination: ArtifactsEventDestination
): Worker_Binding {
	if (destination.type === "queue") {
		return { name, queue: { name: getQueueServiceName(destination.queue) } };
	}
	return {
		name,
		service: {
			name: getWorkflowBindingServiceName(destination.workflowName),
			entrypoint: "WorkflowBinding",
		},
	};
}

function getOwnedWorkflowNames(config: Worker): Set<string> {
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
	owner: string | null,
	route: Omit<ArtifactsEventSubscriptionRoute, "id">
): ArtifactsEventSubscriptionRoute {
	// Identical configuration keeps its subscription ID across reloads.
	const id = createHash("sha256")
		.update(JSON.stringify({ owner, ...route }))
		.digest("hex")
		.slice(0, 32);
	return { id, ...route };
}
