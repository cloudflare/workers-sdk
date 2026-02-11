import { APIError } from "@cloudflare/workers-utils";
import { fetchResult } from "../cfetch";
import type { Workflow } from "../workflows/types";
import type { Config } from "@cloudflare/workers-utils";

export interface WorkflowConflict {
	name: string;
	currentOwner: string;
}

export const WORKFLOW_NOT_FOUND_CODE = 10200;

/**
 * Fetches a single workflow by name from the Cloudflare API.
 *
 * @param config - The resolved config
 * @param accountId - The account ID
 * @param workflowName - The name of the workflow to fetch
 * @returns The workflow if it exists, or `null` if not found (API error code 10200)
 * @throws {APIError} Re-throws any API error that is not a "workflow not found" error (e.g., network errors, auth errors, rate limits)
 */
async function getWorkflow(
	config: Config,
	accountId: string,
	workflowName: string
): Promise<Workflow | null> {
	try {
		return await fetchResult<Workflow>(
			config,
			`/accounts/${accountId}/workflows/${workflowName}`
		);
	} catch (e) {
		if (e instanceof APIError && e.code === WORKFLOW_NOT_FOUND_CODE) {
			return null;
		}
		throw e;
	}
}

/**
 * Checks whether any workflows being deployed already exist and belong to a different worker.
 *
 * @param config The resolved config
 * @param accountId The account ID
 * @param scriptName The name of the worker script being deployed
 * @returns object with a `hasConflicts` flag, and if true, the list of conflicts and a message
 */
export async function checkWorkflowConflicts(
	config: Config,
	accountId: string,
	scriptName: string
): Promise<
	| { hasConflicts: false }
	| { hasConflicts: true; conflicts: WorkflowConflict[]; message: string }
> {
	// Only check workflows that will be deployed by this script
	// script_name defines the worker name of the workflow owner
	// Workflows with script_name set to another worker are external bindings
	// referencing workflows owned by other workers and should be skipped
	const workflowsToDeploy = config.workflows?.filter(
		(w) => w.script_name === undefined || w.script_name === scriptName
	);

	if (!workflowsToDeploy?.length) {
		return { hasConflicts: false };
	}

	const workflowChecks = await Promise.all(
		workflowsToDeploy.map(async (workflow) => {
			const existing = await getWorkflow(config, accountId, workflow.name);
			if (existing && existing.script_name !== scriptName) {
				return { name: workflow.name, currentOwner: existing.script_name };
			}
			return null;
		})
	);

	const conflicts = workflowChecks.filter(
		(c): c is WorkflowConflict => c !== null
	);

	if (conflicts.length === 0) {
		return { hasConflicts: false };
	}

	const conflictList = conflicts
		.map((c) => `  - "${c.name}" (currently belongs to "${c.currentOwner}")`)
		.join("\n");

	const message =
		`The following workflow(s) already exist and belong to different workers:\n${conflictList}\n\n` +
		`Deploying will reassign these workflows to "${scriptName}".`;

	return { hasConflicts: true, conflicts, message };
}
