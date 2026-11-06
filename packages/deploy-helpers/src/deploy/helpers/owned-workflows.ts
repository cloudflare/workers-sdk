import { partitionExports, UserError } from "@cloudflare/workers-utils";
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
 * is returned once, with the export's settings;
 * {@link validateOwnedWorkflowDeclarations} guarantees the binding sets none.
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
		owned.set(workflowExport.name, {
			name: workflowExport.name,
			class_name: className,
			limits: workflowExport.limits,
			concurrency: workflowExport.concurrency,
			schedules: workflowExport.schedules,
			default_retention: workflowExport.default_retention,
			jurisdiction: workflowExport.jurisdiction,
		});
	}
	return [...owned.values()];
}

/**
 * Checks that each `workflows` binding owned by this script only binds the
 * `workflow` export of the same name: same class, and no settings, since the
 * export holds them. Also checks that no binding to another script's Workflow
 * shares a name with an export, since the export makes this script the
 * Workflow's owner.
 * This can't run during config validation: ownership depends on the name the
 * script is deployed under, which `--name` or a CI override can change after
 * the config is validated.
 *
 * @param config - The Worker config
 * @param scriptName - The name of the script being deployed
 * @throws {UserError} If a binding and an export for the same Workflow use
 * different classes, the binding sets a setting, or they disagree about which
 * script owns the Workflow
 */
export function validateOwnedWorkflowDeclarations(
	config: Pick<Config, "workflows" | "exports">,
	scriptName: string
): void {
	const exportsByWorkflowName = new Map(
		Object.entries(partitionExports(config.exports).workflow).map(
			([className, workflowExport]) => [workflowExport.name, className]
		)
	);
	const errors: string[] = [];
	for (const [index, workflow] of (config.workflows ?? []).entries()) {
		const className = exportsByWorkflowName.get(workflow.name);
		if (className === undefined) {
			continue;
		}
		if (!isWorkflowDefinedInThisScript(workflow, scriptName)) {
			errors.push(
				`"workflows[${index}]" binds the Workflow "${workflow.name}" of the Worker "${workflow.script_name}", but "exports.${className}" declares it in this Worker. Workflow names are unique per account, so remove "script_name" from the binding or give the export a different name.`
			);
			continue;
		}
		if (workflow.class_name !== className) {
			errors.push(
				`"workflows[${index}]" and "exports.${className}" both declare the Workflow "${workflow.name}", but with different classes ("${workflow.class_name}" and "${className}").`
			);
		}
		for (const key of [
			"limits",
			"concurrency",
			"schedules",
			"default_retention",
			"jurisdiction",
		] as const) {
			if (workflow[key] !== undefined) {
				errors.push(
					`"workflows[${index}].${key}" configures the Workflow "${workflow.name}", which "exports.${className}" declares. Set "${key}" on the export instead.`
				);
			}
		}
	}
	if (errors.length > 0) {
		throw new UserError(errors.join("\n"), {
			telemetryMessage: "workflow binding and export declarations conflict",
		});
	}
}
