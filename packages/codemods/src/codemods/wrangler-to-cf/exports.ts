import {
	call,
	camelObject,
	getRecord,
	getRecords,
	hasOwn,
	isRecord,
	optionsFromRecord,
	toOutputValue,
	type UnknownRecord,
} from "./converter-helpers";
import { DURABLE_OBJECT_EXPORTS_DOCS_URL, createFollowUp } from "./follow-ups";
import type { MigrationFollowUp, OutputObject, OutputProperty } from "./types";

export const WORKFLOW_SETTINGS = [
	"limits",
	"concurrency",
	"schedules",
	"default_retention",
] as const;

/**
 * Whether this Worker defines the Workflow a `workflows` entry binds to. This
 * matches Wrangler's `isWorkflowDefinedInThisScript`: no `script_name`, or a
 * `script_name` naming this Worker. `source.name` is already the effective
 * name in a named environment (`<name>-<environment>`).
 */
export function isLocalWorkflow(
	entry: UnknownRecord,
	source: UnknownRecord
): boolean {
	return (
		typeof entry.script_name !== "string" || entry.script_name === source.name
	);
}

/**
 * Options for `exports.workflow(...)`, from either a Wrangler `exports`
 * entry of type "workflow" or a `workflows` binding entry. Both carry the
 * same snake_case settings, and the new config spells the nested retention
 * keys in camelCase (`defaultRetention.successRetention`).
 */
function workflowExportOptions(record: UnknownRecord): OutputObject {
	const properties: OutputProperty[] = [];
	const name = toOutputValue(record.name);
	if (name !== undefined) {
		properties.push({ key: "name", value: name });
	}
	for (const key of ["limits", "concurrency"] as const) {
		const value = getRecord(record, key);
		if (value) {
			properties.push({ key, value: camelObject(value) });
		}
	}
	const schedules = toOutputValue(record.schedules);
	if (schedules !== undefined) {
		properties.push({ key: "schedules", value: schedules });
	}
	const retention = getRecord(record, "default_retention");
	if (retention) {
		properties.push({ key: "defaultRetention", value: camelObject(retention) });
	}
	return { kind: "object", properties };
}

export function convertExports(
	source: UnknownRecord,
	sourcePrefix: string,
	imports: Set<string>,
	report: (followUp: MigrationFollowUp) => void
): OutputObject | undefined {
	const configuredExports = getRecord(source, "exports") ?? {};

	const properties: OutputProperty[] = [];
	// Workflow exports render last, once every `workflows` binding has had the
	// chance to merge its settings into them; each keeps its place in order.
	const workflowExports = new Map<string, UnknownRecord>();
	const pendingWorkflows: Array<[OutputProperty, UnknownRecord]> = [];
	function addWorkflowExport(key: string, record: UnknownRecord): void {
		const property: OutputProperty = { key, value: call("exports.workflow") };
		properties.push(property);
		workflowExports.set(key, record);
		pendingWorkflows.push([property, record]);
	}
	for (const [name, value] of Object.entries(configuredExports)) {
		if (!isRecord(value)) {
			continue;
		}

		const sourcePath = `${sourcePrefix ? `${sourcePrefix}.` : ""}exports.${name}`;
		if (value.type === "worker") {
			imports.add("exports");
			const args = getRecord(value, "cache");
			properties.push({
				key: name,
				value: args
					? call("exports.worker", {
							kind: "object",
							properties: [
								{
									key: "cache",
									value: camelObject(args),
								},
							],
						})
					: call("exports.worker"),
			});
			continue;
		}

		if (value.type === "durable-object") {
			imports.add("exports");
			const options = optionsFromRecord(value, [
				["renamed_to", "renamedTo"],
				["state", "state"],
				["storage", "storage"],
				["transfer_from", "transferFrom"],
				["transferred_to", "transferredTo"],
			]);
			properties.push({
				key: name,
				value: call("exports.durableObject", options),
			});
			report(
				createFollowUp(
					"durable-object-review",
					"Durable Object exports require manual review after migration.",
					{ docsUrl: DURABLE_OBJECT_EXPORTS_DOCS_URL, sourcePath }
				)
			);
			if (hasOwn(value, "container")) {
				report(
					createFollowUp(
						"container-review",
						"A Durable Object export references a Container. Reconnect it manually after migrating the Container.",
						{ sourcePath }
					)
				);
			}
			continue;
		}

		if (value.type === "workflow") {
			imports.add("exports");
			addWorkflowExport(name, { ...value });
			continue;
		}

		report(
			createFollowUp(
				"unsupported-export",
				`The export \`${name}\` could not be migrated.`,
				{ sourcePath }
			)
		);
	}
	// A `workflows` binding to a Workflow this Worker defines becomes an export
	// here, carrying the Workflow's settings. When the Wrangler `exports` table
	// already declares the same Workflow, the two merge the way Wrangler merges
	// them (`getWorkflowsOwnedByScript`), with the binding's settings winning.
	for (const [index, entry] of getRecords(source, "workflows").entries()) {
		if (
			!isLocalWorkflow(entry, source) ||
			typeof entry.class_name !== "string" ||
			entry.class_name.length === 0
		) {
			continue;
		}
		const existing = workflowExports.get(entry.class_name);
		if (existing === undefined) {
			imports.add("exports");
			addWorkflowExport(entry.class_name, { ...entry });
			continue;
		}
		if (existing.name === entry.name) {
			for (const key of WORKFLOW_SETTINGS) {
				if (hasOwn(entry, key)) {
					existing[key] = entry[key];
				}
			}
			continue;
		}
		// The new config declares one Workflow per exported class, so a second
		// Workflow on the same class keeps its binding and loses its settings.
		const lost = WORKFLOW_SETTINGS.filter((key) => hasOwn(entry, key));
		if (lost.length > 0) {
			const sourcePath = `${sourcePrefix ? `${sourcePrefix}.` : ""}workflows.${index}`;
			report(
				createFollowUp(
					"workflow-shared-class",
					`The Workflow \`${String(entry.name)}\` at \`${sourcePath}\` uses the class \`${entry.class_name}\`, which already exports the Workflow \`${String(existing.name)}\`. The new config declares one Workflow per exported class, so its ${lost.map((key) => `\`${key}\``).join(", ")} were not migrated.`,
					{ sourcePath }
				)
			);
		}
	}
	for (const [property, record] of pendingWorkflows) {
		property.value = call("exports.workflow", workflowExportOptions(record));
	}

	return properties.length > 0 ? { kind: "object", properties } : undefined;
}
