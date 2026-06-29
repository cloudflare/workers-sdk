import assert from "node:assert";
import { APIError, UserError } from "@cloudflare/workers-utils";
import { fetchResult } from "../cfetch";
import { confirm } from "../dialogs";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import {
	createEmailRoutingRule,
	deleteEmailRoutingRule,
	updateEmailRoutingCatchAll,
	updateEmailRoutingRule,
} from "./client";
import {
	buildEmailRoutingPlanRequest,
	isCatchAllAddress,
	planHasChanges,
	planHasDestructiveChanges,
	renderEmailRoutingPlan,
	ruleShapeForTarget,
} from "./plan";
import type {
	EmailRoutingPlanChange,
	EmailRoutingPlanRequest,
	EmailRoutingPlanResponse,
} from "./plan";
import type { Config } from "@cloudflare/workers-utils";

/**
 * Network side of the `addresses` config field: plan the change set via the
 * account-level endpoint, then apply it through the rule client. Pure logic
 * lives in `plan.ts`.
 */

const PLAN_RETRY_WORKER_NOT_FOUND_CODE = 2016;
const PLAN_RETRY_TIMEOUT_MS = 30_000;
const PLAN_RETRY_DELAY_MS = 3_000;

function postJson(body: unknown): RequestInit {
	return {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	};
}

/** The desired rule body for a target owned by this Worker (create/update). */
function desiredRuleBody(
	target: string,
	workerName: string,
	ownerWorkerTag: string
) {
	return {
		...ruleShapeForTarget(target, workerName),
		enabled: true,
		source: "wrangler",
		owner_worker_tag: ownerWorkerTag,
	};
}

/** Generated default catch-all (drop, disabled), with ownership cleared. */
const RESET_CATCH_ALL_BODY = {
	matchers: [{ type: "all" }],
	actions: [{ type: "drop" }],
	enabled: false,
	name: "",
	source: "api",
};

/** Resolve the deployed Worker's stable public tag (used as owner_worker_tag). */
async function resolveOwnerWorkerTag(
	config: Config,
	accountId: string,
	scriptName: string
): Promise<string> {
	const { default_environment } = await fetchResult<{
		default_environment: { script: { tag: string } };
	}>(config, `/accounts/${accountId}/workers/services/${scriptName}`);
	return default_environment.script.tag;
}

/**
 * Call the account-level plan endpoint. The Worker was just uploaded, so retry
 * on "worker not found" (2016) until it propagates or we hit the ~30s cap.
 */
async function fetchEmailRoutingPlan(
	config: Config,
	accountId: string,
	request: EmailRoutingPlanRequest
): Promise<EmailRoutingPlanResponse> {
	const deadline = Date.now() + PLAN_RETRY_TIMEOUT_MS;
	for (;;) {
		try {
			return await fetchResult<EmailRoutingPlanResponse>(
				config,
				`/accounts/${accountId}/email/routing/rules/plan`,
				postJson(request)
			);
		} catch (e) {
			const isWorkerNotFound =
				e instanceof APIError && e.code === PLAN_RETRY_WORKER_NOT_FOUND_CODE;
			if (!isWorkerNotFound) {
				throw e;
			}
			if (Date.now() + PLAN_RETRY_DELAY_MS >= deadline) {
				throw new UserError(
					"Email Routing could not find the deployed Worker yet (it may still be propagating). Re-run `wrangler deploy`.",
					{ telemetryMessage: "email routing plan worker not found" }
				);
			}
			await new Promise((resolve) => setTimeout(resolve, PLAN_RETRY_DELAY_MS));
		}
	}
}

/** Apply a single plan change through the canonical per-zone rule client. */
async function applyChange(
	config: Config,
	zoneId: string,
	change: EmailRoutingPlanChange,
	workerName: string,
	ownerWorkerTag: string
): Promise<void> {
	if (isCatchAllAddress(change.target)) {
		// Catch-all has no DELETE endpoint: a delete is a reset to the default.
		await updateEmailRoutingCatchAll(
			config,
			zoneId,
			change.type === "deleted"
				? RESET_CATCH_ALL_BODY
				: desiredRuleBody(change.target, workerName, ownerWorkerTag)
		);
		return;
	}

	switch (change.type) {
		case "added":
			await createEmailRoutingRule(
				config,
				zoneId,
				desiredRuleBody(change.target, workerName, ownerWorkerTag)
			);
			return;
		// `conflict` only reaches here once the user accepted the takeover; it is
		// applied the same way as an update — overwrite the existing rule.
		case "updated":
		case "conflict": {
			const id = change.remote?.id;
			if (!id) {
				throw new UserError(
					`Email Routing plan was missing the rule id for "${change.target}"; re-run \`wrangler deploy\`.`,
					{ telemetryMessage: "email routing plan missing rule id" }
				);
			}
			await updateEmailRoutingRule(
				config,
				zoneId,
				id,
				desiredRuleBody(change.target, workerName, ownerWorkerTag)
			);
			return;
		}
		case "deleted": {
			const id = change.remote?.id;
			if (!id) {
				throw new UserError(
					`Email Routing plan was missing the rule id for "${change.target}"; re-run \`wrangler deploy\`.`,
					{ telemetryMessage: "email routing plan missing rule id" }
				);
			}
			await deleteEmailRoutingRule(config, zoneId, id);
			return;
		}
	}
}

/**
 * Reconcile the Worker's Email Routing rules with the `addresses` config during
 * `wrangler deploy`. No-op when `addresses` is absent. Runs after upload, so a
 * failure leaves the Worker deployed but reports partial success. Prompts once
 * for destructive changes and hard-fails non-interactively.
 */
export async function applyEmailRoutingAddresses({
	config,
	accountId,
	scriptName,
	workerTag,
}: {
	config: Config;
	accountId: string | undefined;
	scriptName: string | undefined;
	workerTag: string | null;
}): Promise<void> {
	const { addresses } = config;
	if (addresses === undefined) {
		return;
	}

	assert(accountId, "Missing accountId");
	assert(scriptName, "Missing Worker name");

	const ownerWorkerTag =
		workerTag ?? (await resolveOwnerWorkerTag(config, accountId, scriptName));
	const request = buildEmailRoutingPlanRequest(
		addresses,
		scriptName,
		ownerWorkerTag
	);
	const plan = await fetchEmailRoutingPlan(config, accountId, request);

	if (!planHasChanges(plan)) {
		logger.log("Email Routing addresses already up to date.");
		return;
	}

	logger.log(
		["Email Routing plan:", ...renderEmailRoutingPlan(plan, scriptName)].join(
			"\n"
		)
	);

	if (planHasDestructiveChanges(plan)) {
		if (isNonInteractiveOrCI()) {
			throw new UserError(
				"Worker deployed, but Email Routing has destructive changes (deletes or takeover conflicts) that need confirmation. " +
					"Re-run `wrangler deploy` interactively, or remove the conflicting entries from `addresses`.",
				{
					telemetryMessage:
						"email routing destructive changes need confirmation",
				}
			);
		}
		const accepted = await confirm(
			"Apply these Email Routing changes (including the destructive ones above)?",
			{ defaultValue: false }
		);
		if (!accepted) {
			throw new UserError(
				"Worker deployed, but the Email Routing changes were declined; no rules were modified.",
				{ telemetryMessage: "email routing changes declined" }
			);
		}
	}

	const failures: string[] = [];
	for (const zone of plan.zones) {
		for (const change of zone.changes) {
			try {
				await applyChange(
					config,
					zone.zone_id,
					change,
					scriptName,
					ownerWorkerTag
				);
			} catch (e) {
				failures.push(
					`${change.target}: ${e instanceof Error ? e.message : String(e)}`
				);
			}
		}
	}

	if (failures.length > 0) {
		for (const failure of failures) {
			logger.error(`Email Routing change failed — ${failure}`);
		}
		throw new UserError(
			`Worker deployed, but Email Routing was not fully applied (${failures.length} change(s) failed). Re-run \`wrangler deploy\` to retry.`,
			{ telemetryMessage: "email routing apply partial failure" }
		);
	}

	logger.log("Email Routing addresses applied.");
}
