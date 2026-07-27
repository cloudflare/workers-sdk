import chalk from "chalk";

/**
 * Pure plan logic for the `addresses` config field: build the plan request and
 * render the plan response. No network access.
 */

interface EmailRoutingAction {
	type: string;
	value?: string[];
}

interface EmailRoutingMatcher {
	type: string;
	field?: string;
	value?: string;
}

/** A `*@domain` catch-all target (e.g. `"*@example.com"`), not a literal recipient. */
export function isCatchAllAddress(address: string): boolean {
	return address.startsWith("*@") && address.length > "*@".length;
}

export interface EmailRoutingPlanRule {
	matchers: EmailRoutingMatcher[];
	actions: EmailRoutingAction[];
}

export interface EmailRoutingPlanCatchAll {
	/** The `*@domain` target this catch-all rule applies to. */
	target: string;
	rule: EmailRoutingPlanRule;
}

export interface EmailRoutingPlanRequest {
	owner_worker_tag: string;
	rules: EmailRoutingPlanRule[];
	catch_all_rules: EmailRoutingPlanCatchAll[];
}

export type PlanChangeType = "added" | "updated" | "deleted" | "conflict";

export interface PlanRemoteRule {
	id?: string;
	matchers: EmailRoutingMatcher[];
	actions: EmailRoutingAction[];
	source?: "api" | "wrangler";
	owner_worker_name?: string;
}

export interface EmailRoutingPlanChange {
	type: PlanChangeType;
	/** Recipient address or `*@domain` catch-all target this change applies to. */
	target: string;
	/** Present for updates, deletes, and conflicts. */
	remote?: PlanRemoteRule;
}

export interface EmailRoutingPlanZone {
	zone_id: string;
	zone_name?: string;
	changes: EmailRoutingPlanChange[];
}

export interface EmailRoutingPlanResponse {
	zones: EmailRoutingPlanZone[];
}

/**
 * The matchers + actions routing one address to `workerName`. Single source of
 * truth shared by the plan request and the apply bodies.
 */
export function ruleShapeForTarget(
	target: string,
	workerName: string
): EmailRoutingPlanRule {
	const actions: EmailRoutingAction[] = [
		{ type: "worker", value: [workerName] },
	];
	if (isCatchAllAddress(target)) {
		return { matchers: [{ type: "all" }], actions };
	}
	return {
		matchers: [{ type: "literal", field: "to", value: target }],
		actions,
	};
}

/**
 * Compile the `addresses` config into a plan request: literal recipients become
 * normal rules, `*@domain` entries become catch-all rules carrying the target.
 */
export function buildEmailRoutingPlanRequest(
	addresses: string[],
	workerName: string,
	ownerWorkerTag: string
): EmailRoutingPlanRequest {
	const rules: EmailRoutingPlanRule[] = [];
	const catchAllRules: EmailRoutingPlanCatchAll[] = [];

	for (const address of addresses) {
		const rule = ruleShapeForTarget(address, workerName);
		if (isCatchAllAddress(address)) {
			catchAllRules.push({ target: address, rule });
		} else {
			rules.push(rule);
		}
	}

	return {
		owner_worker_tag: ownerWorkerTag,
		rules,
		catch_all_rules: catchAllRules,
	};
}

/** Changes that need user confirmation: deletes (incl. catch-all resets) and conflicts. */
export function isDestructiveChange(change: EmailRoutingPlanChange): boolean {
	return change.type === "deleted" || change.type === "conflict";
}

export function planHasChanges(plan: EmailRoutingPlanResponse): boolean {
	return plan.zones.some((zone) => zone.changes.length > 0);
}

export function planHasDestructiveChanges(
	plan: EmailRoutingPlanResponse
): boolean {
	return plan.zones.some((zone) => zone.changes.some(isDestructiveChange));
}

const CHANGE_MARKERS: Record<PlanChangeType, () => string> = {
	added: () => chalk.green("+"),
	updated: () => chalk.yellow("~"),
	deleted: () => chalk.red("-"),
	conflict: () => chalk.red("!"),
};

/** Human description of what a remote rule currently does, for conflict lines. */
function describeRemoteAction(remote: PlanRemoteRule): string {
	const action = remote.actions[0];
	if (!action) {
		return "no action";
	}
	const value = action.value?.join(", ");
	switch (action.type) {
		case "forward":
			return value ? `forward to ${value}` : "forward";
		case "worker":
			return value ? `worker ${value}` : "worker";
		case "drop":
			return "drop";
		default:
			return action.type;
	}
}

/** Human description of who owns a conflicting remote rule. */
function describeConflictOwner(remote: PlanRemoteRule): string {
	if (remote.source === "wrangler") {
		return remote.owner_worker_name
			? `owned by worker "${remote.owner_worker_name}"`
			: "owned by another Worker";
	}
	return "managed outside Wrangler";
}

/**
 * Render the plan grouped by zone, one change per line (`+ ~ - !`) plus a
 * summary. Returns lines so callers can log and tests can assert.
 */
export function renderEmailRoutingPlan(
	plan: EmailRoutingPlanResponse,
	workerName: string
): string[] {
	const lines: string[] = [];
	const counts: Record<PlanChangeType, number> = {
		added: 0,
		updated: 0,
		deleted: 0,
		conflict: 0,
	};
	let zonesWithChanges = 0;

	for (const zone of plan.zones) {
		if (zone.changes.length === 0) {
			continue;
		}
		zonesWithChanges++;
		lines.push(zone.zone_name ?? zone.zone_id);

		for (const change of zone.changes) {
			counts[change.type]++;
			const marker = CHANGE_MARKERS[change.type]();
			switch (change.type) {
				case "added":
				case "updated":
					lines.push(`  ${marker} ${change.target} -> worker (${workerName})`);
					break;
				case "deleted":
					lines.push(`  ${marker} ${change.target} (removed from config)`);
					break;
				case "conflict": {
					const remote = change.remote;
					const detail = remote
						? `conflict: ${describeConflictOwner(remote)} (${describeRemoteAction(remote)})`
						: "conflict";
					lines.push(`  ${marker} ${change.target} -> ${detail}`);
					break;
				}
			}
		}
	}

	const total =
		counts.added + counts.updated + counts.deleted + counts.conflict;
	const parts: string[] = [];
	if (counts.added) {
		parts.push(`${counts.added} added`);
	}
	if (counts.updated) {
		parts.push(`${counts.updated} updated`);
	}
	if (counts.deleted) {
		parts.push(`${counts.deleted} deleted`);
	}
	if (counts.conflict) {
		parts.push(`${counts.conflict} conflict`);
	}

	lines.push(
		`${total} ${total === 1 ? "change" : "changes"} across ${zonesWithChanges} ${
			zonesWithChanges === 1 ? "zone" : "zones"
		}${parts.length ? ` (${parts.join(", ")})` : ""}`
	);

	return lines;
}
