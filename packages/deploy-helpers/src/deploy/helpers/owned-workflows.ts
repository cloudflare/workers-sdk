import { partitionExports } from "@cloudflare/workers-utils";
import type { Config, WorkflowBinding } from "@cloudflare/workers-utils";

export type OwnedWorkflow = Omit<WorkflowBinding, "binding" | "script_name">;

export function isWorkflowDefinedInThisScript(
	workflow: Config["workflows"][number],
	scriptName: string
): boolean {
	return (
		workflow.script_name === undefined || workflow.script_name === scriptName
	);
}

/**
 * Collects the Workflows this script defines, from both `workflows` bindings
 * and `exports` entries of type `workflow`. A Workflow declared in both places
 * is returned once, with the settings of both declarations merged; config
 * validation guarantees the two declarations agree.
 *
 * @param config - The Worker config
 * @param scriptName - The name of the script being deployed
 * @returns One entry per Workflow name defined by this script
 */
export function getWorkflowsOwnedByScript(
	config: Pick<Config, "workflows" | "exports">,
	scriptName: string
): OwnedWorkflow[] {
	const owned = new Map<string, OwnedWorkflow>();
	for (const workflow of config.workflows ?? []) {
		if (isWorkflowDefinedInThisScript(workflow, scriptName)) {
			owned.set(workflow.name, workflow);
		}
	}
	for (const [className, workflowExport] of Object.entries(
		partitionExports(config.exports).workflow
	)) {
		const binding = owned.get(workflowExport.name);
		owned.set(workflowExport.name, {
			...binding,
			name: workflowExport.name,
			class_name: className,
			limits: binding?.limits ?? workflowExport.limits,
		});
	}
	return [...owned.values()];
}
