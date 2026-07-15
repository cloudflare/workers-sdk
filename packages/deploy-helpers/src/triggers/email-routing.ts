import { spinner } from "@cloudflare/cli-shared-helpers/interactive";
import {
	APIError,
	isNonInteractiveOrCI,
	UserError,
} from "@cloudflare/workers-utils";
import { isWorkerNotFoundError } from "../deploy/helpers/worker-not-found-error";
import { confirm, fetchResult, logger } from "../shared/context";
import {
	buildEmailRoutingPlanRequest,
	isCatchAllAddress,
	planHasChanges,
	planHasDestructiveChanges,
	renderEmailRoutingPlan,
	ruleShapeForTarget,
} from "./email-routing-plan";
import type {
	EmailRoutingPlanChange,
	EmailRoutingPlanRequest,
	EmailRoutingPlanResponse,
} from "./email-routing-plan";
import type { Config } from "@cloudflare/workers-utils";

/**
 * Network side of the `addresses` config field: plan the change set via the
 * account-level endpoint, then apply it through the per-zone rule endpoints.
 */

const PLAN_RETRY_WORKER_NOT_FOUND_CODE = 2016;
const PLAN_RETRY_TIMEOUT_MS = 30_000;
const PLAN_RETRY_DELAY_MS = 3_000;
const NON_INTERACTIVE_PROGRESS_INTERVAL = 10;

function applyProgressMessage(done: number, total: number): string {
	return `Applying Email Routing changes (${done}/${total}, ${Math.floor(
		(done * 100) / total
	)}%)`;
}

function startApplyProgress(total: number): {
	update(done: number): void;
	stop(): void;
} {
	if (!isNonInteractiveOrCI()) {
		const progress = spinner();
		progress.start(applyProgressMessage(0, total));

		return {
			update: (done) => progress.update(applyProgressMessage(done, total)),
			stop: () => progress.stop(),
		};
	}

	logger.log(applyProgressMessage(0, total));

	return {
		update(done) {
			if (done === total || done % NON_INTERACTIVE_PROGRESS_INTERVAL === 0) {
				logger.log(applyProgressMessage(done, total));
			}
		},
		stop() {},
	};
}

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
	const deadline = Date.now() + PLAN_RETRY_TIMEOUT_MS;
	for (;;) {
		try {
			const { default_environment } = await fetchResult<{
				default_environment: { script: { tag: string } };
			}>(config, `/accounts/${accountId}/workers/services/${scriptName}`);
			return default_environment.script.tag;
		} catch (error) {
			if (!isWorkerNotFoundError(error)) {
				throw error;
			}
			if (Date.now() + PLAN_RETRY_DELAY_MS >= deadline) {
				throw new UserError(
					"Email Routing could not find the deployed Worker yet. Re-run the deployment.",
					{ telemetryMessage: "email routing worker metadata not found" }
				);
			}
			await new Promise((resolve) => setTimeout(resolve, PLAN_RETRY_DELAY_MS));
		}
	}
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
					"Email Routing could not find the deployed Worker yet. Re-run the deployment.",
					{ telemetryMessage: "email routing plan worker not found" }
				);
			}
			await new Promise((resolve) => setTimeout(resolve, PLAN_RETRY_DELAY_MS));
		}
	}
}

function putJson(
	config: Config,
	path: string,
	body: unknown
): Promise<unknown> {
	return fetchResult(config, path, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

/** Apply a single plan change through the per-zone rule endpoints. */
async function applyChange(
	config: Config,
	zoneId: string,
	change: EmailRoutingPlanChange,
	workerName: string,
	ownerWorkerTag: string
): Promise<void> {
	if (isCatchAllAddress(change.target)) {
		// Catch-all has no DELETE endpoint: a delete is a reset to the default.
		await putJson(
			config,
			`/zones/${zoneId}/email/routing/rules/catch_all`,
			change.type === "deleted"
				? RESET_CATCH_ALL_BODY
				: desiredRuleBody(change.target, workerName, ownerWorkerTag)
		);
		return;
	}

	switch (change.type) {
		case "added":
			await fetchResult(
				config,
				`/zones/${zoneId}/email/routing/rules`,
				postJson(desiredRuleBody(change.target, workerName, ownerWorkerTag))
			);
			return;
		// `conflict` only reaches here once the user accepted the takeover; it is
		// applied the same way as an update: overwrite the existing rule.
		case "updated":
		case "conflict": {
			const id = change.remote?.id;
			if (!id) {
				throw new UserError(
					`Email Routing plan was missing the rule id for "${change.target}"; re-run the deployment.`,
					{ telemetryMessage: "email routing plan missing rule id" }
				);
			}
			await putJson(
				config,
				`/zones/${zoneId}/email/routing/rules/${id}`,
				desiredRuleBody(change.target, workerName, ownerWorkerTag)
			);
			return;
		}
		case "deleted": {
			const id = change.remote?.id;
			if (!id) {
				throw new UserError(
					`Email Routing plan was missing the rule id for "${change.target}"; re-run the deployment.`,
					{ telemetryMessage: "email routing plan missing rule id" }
				);
			}
			await fetchResult(config, `/zones/${zoneId}/email/routing/rules/${id}`, {
				method: "DELETE",
			});
			return;
		}
	}
}

/**
 * Reconcile the Worker's Email Routing rules with the `addresses` config after
 * its triggers deploy. No-op when `addresses` is absent. Prompts once for
 * destructive changes and hard-fails non-interactively.
 */
export async function applyEmailRoutingAddresses({
	config,
	accountId,
	scriptName,
	workerTag,
}: {
	config: Config;
	accountId: string;
	scriptName: string;
	workerTag?: string | null;
}): Promise<void> {
	const { addresses } = config;
	if (addresses === undefined) {
		return;
	}

	const ownerWorkerTag =
		workerTag ?? (await resolveOwnerWorkerTag(config, accountId, scriptName));
	const request = buildEmailRoutingPlanRequest(
		addresses,
		scriptName,
		ownerWorkerTag
	);
	const plan = await fetchEmailRoutingPlan(config, accountId, request);

	if (!planHasChanges(plan)) {
		logger.log("Email Routing rules are up to date.");
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
				"The Worker is deployed, but Email Routing has destructive changes (deletes or takeover conflicts) that need confirmation. " +
					"Re-run the deployment interactively, or remove the conflicting entries from `addresses`.",
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
				"The Worker is deployed, but the Email Routing changes were declined; no rules were modified.",
				{ telemetryMessage: "email routing changes declined" }
			);
		}
	}

	const failures: string[] = [];
	const totalChanges = plan.zones.reduce(
		(total, zone) => total + zone.changes.length,
		0
	);
	const progress = startApplyProgress(totalChanges);
	let completedChanges = 0;

	try {
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
				} finally {
					completedChanges++;
					progress.update(completedChanges);
				}
			}
		}
	} finally {
		progress.stop();
	}

	if (failures.length > 0) {
		for (const failure of failures) {
			logger.error(`Email Routing change failed: ${failure}`);
		}
		throw new UserError(
			`The Worker is deployed, but Email Routing was not fully applied (${failures.length} change(s) failed). Re-run the deployment to retry.`,
			{ telemetryMessage: "email routing apply partial failure" }
		);
	}

	logger.log("Email Routing addresses applied.");
}
