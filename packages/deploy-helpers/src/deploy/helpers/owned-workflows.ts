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
 * and `exports` entries of type `workflow`.
 * {@link validateOwnedWorkflowDeclarations} guarantees each Workflow is
 * declared in only one of them.
 *
 * @param config - The Worker config
 * @param scriptName - The name of the script being deployed
 * @returns One entry per Workflow name defined by this script
 */
export function getWorkflowsOwnedByScript(
	config: Pick<Config, "workflows" | "exports">,
	scriptName: string
): OwnedWorkflow[] {
	return [
		...(config.workflows ?? []).filter((workflow) =>
			isWorkflowDefinedInThisScript(workflow, scriptName)
		),
		...Object.entries(partitionExports(config.exports).workflow).map(
			([className, workflowExport]) => ({
				name: workflowExport.name,
				class_name: className,
				limits: workflowExport.limits,
				concurrency: workflowExport.concurrency,
				schedules: workflowExport.schedules,
				default_retention: workflowExport.default_retention,
				jurisdiction: workflowExport.jurisdiction,
			})
		),
	];
}

/**
 * Checks that no `workflows` binding shares a name with a `workflow` export.
 * A Workflow this script owns must be declared in only one place, and a
 * binding to another script's Workflow can't share a name with an export,
 * since the export makes this script the Workflow's owner.
 * This can't run during config validation: ownership depends on the name the
 * script is deployed under, which `--name` or a CI override can change after
 * the config is validated.
 *
 * @param config - The Worker config
 * @param scriptName - The name of the script being deployed
 * @throws {UserError} If a `workflows` binding and a `workflow` export use the
 * same Workflow name
 */
export function validateOwnedWorkflowDeclarations(
	config: Pick<Config, "workflows" | "exports">,
	scriptName: string
): void {
	const classNamesByWorkflowName = new Map(
		Object.entries(partitionExports(config.exports).workflow).map(
			([className, workflowExport]) => [workflowExport.name, className]
		)
	);
	const errors: string[] = [];
	for (const [index, workflow] of (config.workflows ?? []).entries()) {
		const className = classNamesByWorkflowName.get(workflow.name);
		if (className === undefined) {
			continue;
		}
		errors.push(
			isWorkflowDefinedInThisScript(workflow, scriptName)
				? `"workflows[${index}]" and "exports.${className}" both declare the Workflow "${workflow.name}". Declare it in only one place: keep the "workflows" entry, or remove it and keep the "exports" entry, using \`ctx.exports.${className}\` in your code.`
				: `"workflows[${index}]" binds the Workflow "${workflow.name}" of the Worker "${workflow.script_name}", but "exports.${className}" declares it in this Worker. Workflow names are unique per account, so remove "script_name" from the binding or give the export a different name.`
		);
	}
	if (errors.length > 0) {
		throw new UserError(errors.join("\n"), {
			telemetryMessage: "workflow binding and export declarations conflict",
		});
	}
}
