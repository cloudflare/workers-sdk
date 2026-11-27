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
import { inferDurableObjectExports } from "./durable-object-exports";
import { createFollowUp } from "./follow-ups";
import type { MigrationFollowUp, OutputObject, OutputProperty } from "./types";

export const WORKFLOW_SETTINGS = [
	"limits",
	"concurrency",
	"schedules",
	"default_retention",
	"jurisdiction",
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
	const events = getRecords(record, "events");
	if (events.length > 0) {
		properties.push({ key: "events", value: events.map(camelObject) });
	}
	const schedules = toOutputValue(record.schedules);
	if (schedules !== undefined) {
		properties.push({ key: "schedules", value: schedules });
	}
	const retention = getRecord(record, "default_retention");
	if (retention) {
		properties.push({ key: "defaultRetention", value: camelObject(retention) });
	}
	const jurisdiction = toOutputValue(record.jurisdiction);
	if (jurisdiction !== undefined) {
		properties.push({ key: "jurisdiction", value: jurisdiction });
	}
	return { kind: "object", properties };
}

/** Attaches legacy targets to the exports that actually own the Workflows. */
function attachWorkflowEvents(
	source: UnknownRecord,
	sourcePrefix: string,
	exports: Map<string, UnknownRecord>,
	report: (followUp: MigrationFollowUp) => void
): void {
	const events = getRecord(source, "triggers")?.events;
	if (!Array.isArray(events)) {
		return;
	}
	for (const [index, event] of events.entries()) {
		const sourcePath = `${sourcePrefix ? sourcePrefix + "." : ""}triggers.events.${index}`;
		if (
			!isRecord(event) ||
			typeof event.type !== "string" ||
			!Array.isArray(event.targets) ||
			event.targets.length === 0 ||
			(event.filter !== undefined && !isRecord(event.filter))
		) {
			report(
				createFollowUp(
					"invalid-workflow-event",
					"This event subscription could not be migrated. Review its type, filter, and Workflow targets.",
					{ sourcePath }
				)
			);
			continue;
		}
		for (const [targetIndex, target] of event.targets.entries()) {
			const owned =
				isRecord(target) && target.type === "workflow"
					? [...exports.values()].filter(
							(workflow) => workflow.name === target.workflow_name
						)
					: [];
			if (owned.length !== 1) {
				report(
					createFollowUp(
						"workflow-event-target",
						"This event target does not identify one Workflow export owned by this Worker. Its subscription was not migrated.",
						{
							sourcePath: `${sourcePath}.targets.${targetIndex}`,
						}
					)
				);
				continue;
			}
			const workflow = owned[0];
			const previous = getRecords(workflow, "events");
			workflow.events = [
				...previous,
				{
					type: event.type,
					...(event.filter === undefined ? {} : { filter: event.filter }),
				},
			];
		}
	}
}

export function convertExports(
	source: UnknownRecord,
	sourcePrefix: string,
	imports: Set<string>,
	report: (followUp: MigrationFollowUp) => void
): OutputObject | undefined {
	const configuredExports = inferDurableObjectExports(
		source,
		sourcePrefix,
		report
	);

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
	// already declares the same Workflow, the two merge, with the binding's
	// settings winning.
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
	attachWorkflowEvents(source, sourcePrefix, workflowExports, report);
	for (const [property, record] of pendingWorkflows) {
		property.value = call("exports.workflow", workflowExportOptions(record));
	}

	return properties.length > 0 ? { kind: "object", properties } : undefined;
}
