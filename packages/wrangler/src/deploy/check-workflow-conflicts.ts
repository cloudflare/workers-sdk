import { checkWorkflowConflicts as checkWorkflowConflictsBase } from "@cloudflare/deploy-helpers";
import type { Config } from "@cloudflare/workers-utils/config";

export type { WorkflowConflict } from "@cloudflare/deploy-helpers";
export { WORKFLOW_NOT_FOUND_CODE } from "@cloudflare/deploy-helpers";

export async function checkWorkflowConflicts(
	config: Config,
	accountId: string,
	scriptName: string
) {
	return checkWorkflowConflictsBase(config, accountId, scriptName);
}
