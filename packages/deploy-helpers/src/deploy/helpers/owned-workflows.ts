import { isDeepStrictEqual } from "node:util";
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
 * is returned once, with the settings of both declarations merged;
 * {@link validateOwnedWorkflowDeclarations} guarantees the two declarations
 * agree.
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
			name: workflowExport.name,
			class_name: className,
			limits: binding?.limits ?? workflowExport.limits,
			concurrency: binding?.concurrency ?? workflowExport.concurrency,
			schedules: binding?.schedules ?? workflowExport.schedules,
			default_retention:
				binding?.default_retention ?? workflowExport.default_retention,
		});
	}
	return [...owned.values()];
}

/**
 * Checks that each `workflows` binding owned by this script agrees with the
 * `workflow` export of the same name, so {@link getWorkflowsOwnedByScript} can
 * merge them. This can't run during config validation: ownership depends on
 * the name the script is deployed under, which `--name` or a CI override can
 * change after the config is validated.
 *
 * @param config - The Worker config
 * @param scriptName - The name of the script being deployed
 * @throws {UserError} If a binding and an export for the same Workflow use
 * different classes or set the same setting to different values
 */
export function validateOwnedWorkflowDeclarations(
	config: Pick<Config, "workflows" | "exports">,
	scriptName: string
): void {
	const exportsByWorkflowName = new Map(
		Object.entries(partitionExports(config.exports).workflow).map(
			([className, workflowExport]) => [
				workflowExport.name,
				{ className, workflowExport },
			]
		)
	);
	const errors: string[] = [];
	for (const [index, workflow] of (config.workflows ?? []).entries()) {
		const match = exportsByWorkflowName.get(workflow.name);
		if (
			match === undefined ||
			!isWorkflowDefinedInThisScript(workflow, scriptName)
		) {
			continue;
		}
		const { className, workflowExport } = match;
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
		] as const) {
			const bindingValue = workflow[key];
			const exportValue = workflowExport[key];
			// `schedules` accepts a string or an array; compare both as arrays.
			if (
				bindingValue !== undefined &&
				exportValue !== undefined &&
				!isDeepStrictEqual([bindingValue].flat(), [exportValue].flat())
			) {
				errors.push(
					`"workflows[${index}].${key}" and "exports.${className}.${key}" both configure the Workflow "${workflow.name}", but with different values. Set "${key}" in only one of them.`
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
