import { createHash } from "node:crypto";
import { MiniflareCoreError } from "../../shared";
import { getEnvBindingsOfType, getExportsOfType } from "../shared";
import { getWorkflowBindingServiceName } from "../workflows";
import type { ParsedWorkerOptions } from "../../config/schema";
import type { Worker_Binding } from "../../runtime";
import type {
	ArtifactsEventRoute,
	ArtifactsEventType,
} from "../../workers/artifacts/events";
import type { ArtifactsEventSubscription } from "@cloudflare/config";

/** An event subscription declared by a Workflow in this instance. */
export interface ArtifactsEventSubscriptionRoute {
	id: string;
	types: ArtifactsEventType[];
	namespace?: string;
	repoName?: string;
	workflowName: string;
}

/**
 * Resolves Workflow-owned event declarations into stable local routes. Every
 * declaration is its own subscription, whether it sits on an export or on a
 * binding, so callers declaring a Workflow both ways put each event on one.
 */
export function getArtifactsEventSubscriptions(
	allWorkerOpts: ParsedWorkerOptions[]
): ArtifactsEventSubscriptionRoute[] {
	const routes: ArtifactsEventSubscriptionRoute[] = [];
	for (const { config } of allWorkerOpts) {
		for (const [, workflow] of getExportsOfType(config, "workflow")) {
			routes.push(
				...workflowRoutes(config.name, workflow.name, workflow.events)
			);
		}
		for (const [, binding] of getEnvBindingsOfType(config, "workflow")) {
			const events = binding.unsafeConfig?.events;
			if (!events?.length) {
				continue;
			}
			if (binding.worker !== config.name) {
				throw new MiniflareCoreError(
					"ERR_VALIDATION",
					`Workflow "${binding.name}" in Worker "${config.name}" cannot declare events for another Worker's Workflow.`
				);
			}
			routes.push(...workflowRoutes(config.name, binding.name, events));
		}
	}
	const occurrences = new Map<string, number>();
	return routes.map((route) => {
		const occurrence = occurrences.get(route.id) ?? 0;
		occurrences.set(route.id, occurrence + 1);
		if (occurrence === 0) {
			return route;
		}
		// Repeated event declarations intentionally create separate deliveries.
		return {
			...route,
			id: createHash("sha256")
				.update(`${route.id}:${occurrence}`)
				.digest("hex")
				.slice(0, 32),
		};
	});
}

/** Builds Workflow service bindings and matching routes for a local namespace. */
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
		const binding = `ARTIFACTS_EVENT_TARGET_${routes.length}`;
		bindings.push({
			name: binding,
			service: {
				name: getWorkflowBindingServiceName(subscription.workflowName),
				entrypoint: "WorkflowBinding",
			},
		});
		routes.push({
			id: subscription.id,
			types: subscription.types,
			...(subscription.repoName === undefined
				? {}
				: { repoName: subscription.repoName }),
			target: { type: "workflow", binding },
		});
	}
	return routes.length === 0
		? []
		: [{ name: "eventRoutes", json: JSON.stringify(routes) }, ...bindings];
}

function workflowRoutes(
	owner: string,
	workflowName: string,
	events: ArtifactsEventSubscription[] = []
): ArtifactsEventSubscriptionRoute[] {
	return events.map((event) => {
		const route = { types: [event.type], ...event.filter, workflowName };
		const id = createHash("sha256")
			.update(JSON.stringify({ owner, ...route }))
			.digest("hex")
			.slice(0, 32);
		return { id, ...route };
	});
}
